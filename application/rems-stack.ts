import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  Port,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import {
  Credentials,
  DatabaseCluster,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import { DockerServiceWithHttpsLoadBalancerConstruct } from "./lib/docker-service-with-https-load-balancer-construct";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import { Cluster, TaskDefinition } from "aws-cdk-lib/aws-ecs";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { RemsSettings } from "./rems-settings";
import { STACK_DESCRIPTION } from "../rems-constants";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

// these are settings for the database *within* the RDS instance, and the postgres user name
// they really shouldn't need to be changed but I will define them here as constants in case
const FIXED_DATABASE_NAME = "rems";
const FIXED_DATABASE_USER = "rems";
const FIXED_CONTAINER_NAME = "rems";

export class RemsStack extends Stack {
  public readonly deployUrlOutput: CfnOutput;

  constructor(scope: Construct, id: string, props: StackProps & RemsSettings) {
    super(scope, id, props);

    this.templateOptions.description = STACK_DESCRIPTION;

    // we have some parameters that are shared amongst a lot of stacks - and rather than repeat in each repo,
    // we look them on synthesis from parameter store
    const hostedZoneName = StringParameter.valueFromLookup(
      this,
      "hosted_zone_name"
    );
    const certApse2Arn = StringParameter.valueFromLookup(
      this,
      "cert_apse2_arn"
    );

    const vpc = Vpc.fromLookup(this, "VPC", { vpcName: "main-vpc" });
    const subnetSelection: SubnetSelection = {
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    };

    // we need to allow this to make AWS calls, but otherwise it does not interact with anything
    // other than itself i.e. db <-> fargate
    const dbAndClusterSecurityGroup = new SecurityGroup(
      this,
      "DbAndClusterSecurityGroup",
      {
        vpc,
        allowAllOutbound: true,
      }
    );

    dbAndClusterSecurityGroup.addIngressRule(
      dbAndClusterSecurityGroup,
      Port.allTraffic()
    );

    // create the db instance or cluster
    const [db, remsDatabaseUrl] = this.addDatabase(
      vpc,
      subnetSelection,
      dbAndClusterSecurityGroup
    );

    const dockerImageFolder = path.join(__dirname, "rems-docker-image");

    const asset = new DockerImageAsset(this, "RemsDockerImage", {
      directory: dockerImageFolder,
      platform: Platform.LINUX_ARM64,
      buildArgs: {},
    });

    const privateServiceWithLoadBalancer =
      new DockerServiceWithHttpsLoadBalancerConstruct(
        this,
        "PrivateServiceWithLb",
        {
          vpc: vpc,
          securityGroups: [dbAndClusterSecurityGroup],
          hostedPrefix: props.hostedPrefix,
          hostedZoneName: hostedZoneName,
          hostedZoneCertArn: certApse2Arn,
          imageAsset: asset,
          memoryLimitMiB: props.memoryLimitMiB,
          cpu: props.cpu,
          desiredCount: 1,
          containerName: FIXED_CONTAINER_NAME,
          healthCheckPath: "/",
          environment: {
            // rather than embed these in the config.edn that is checked into git -
            // we use the mechanism by which these settings can be made using environment variables
            DATABASE_URL: remsDatabaseUrl,
            PUBLIC_URL: `https://${props.hostedPrefix}.${hostedZoneName}/`,
            MAIL_FROM: props.smtpMailFrom,
            SMTP_DEBUG: "true",
          },
        }
      );

    privateServiceWithLoadBalancer.service.taskDefinition.taskRole.attachInlinePolicy(
      new Policy(this, "FargateServiceTaskPolicy", {
        statements: [
          new PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: ["arn:aws:secretsmanager:*:*:secret:Rems*"],
          }),
        ],
      })
    );

    // the command function is an invocable lambda that will then go and spin up an ad-hoc Task in our
    // cluster - we use this for starting admin tasks
    const commandFunction = this.addCommandLambda(
      vpc,
      subnetSelection,
      privateServiceWithLoadBalancer.cluster,
      privateServiceWithLoadBalancer.clusterLogGroup,
      privateServiceWithLoadBalancer.service.taskDefinition,
      [dbAndClusterSecurityGroup]
    );

    // we want to register our lambda into a namespace - so that our CLI tool can locate the
    // lambda for admin tasks
    const namespace = HttpNamespace.fromHttpNamespaceAttributes(
      this,
      "Namespace",
      {
        // this is a bug in the CDK definitions - this field is optional but not defined that way
        // passing an empty string does work
        namespaceArn: "",
        // this is also a bug? surely we should be able to look up a namespace just by name
        namespaceId: props.cloudMapId,
        namespaceName: props.cloudMapNamespace,
      }
    );

    const service = new Service(this, "Service", {
      namespace: namespace,
      name: props.cloudMapServiceName,
      description: "Service for working with REMS",
    });

    service.registerNonIpInstance("CommandLambda", {
      customAttributes: {
        lambdaArn: commandFunction.functionArn,
      },
    });

    new CfnOutput(this, "RemsDatabaseUrl", {
      value: remsDatabaseUrl,
    });
    new CfnOutput(this, "ClusterArn", {
      value: privateServiceWithLoadBalancer.cluster.clusterArn,
    });
    new CfnOutput(this, "TaskDefinitionArn", {
      value:
        privateServiceWithLoadBalancer.service.taskDefinition.taskDefinitionArn,
    });

    this.deployUrlOutput = new CfnOutput(this, "RemsDeployUrl", {
      value: `https://${props.hostedPrefix}.${hostedZoneName}`,
    });
  }

  /**
   * Creates either a single database instance or a database cluster (based on the highlyAvailable
   * setting). Returns the relevant cluster or instance, as well as a URL suitable for connecting
   * to the instance.
   *
   * @param vpc the VPC to put the db in
   * @param subnetSelection the subnet in the VPC to put the db in
   * @param securityGroup the security group to assign to the db
   * @private
   */
  private addDatabase(
    vpc: IVpc,
    subnetSelection: SubnetSelection,
    securityGroup: SecurityGroup
  ): [DatabaseCluster | DatabaseInstance, string] {
    // we actually had an issue where the default password it picked for postgres was invalid
    //    rems/rems/1a7993ef1d2345b78b2066efbe193cde Exception in thread
    //       "main" java.net.URISyntaxException: Illegal character in query at index 109:
    // in a JDBC connection url (the "^" I think).. so anyhow I've made the exclusions to be the default
    // set plus a bunch of others
    const dbCreds = Credentials.fromUsername(FIXED_DATABASE_USER, {
      excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\" + "^_-=",
    });

    let db: DatabaseCluster | DatabaseInstance;
    let dbSocketAddress: string;
    let dbSecret: ISecret;

    db = new DatabaseInstance(this, "Database", {
      removalPolicy: RemovalPolicy.DESTROY,
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_17,
      }),
      credentials: dbCreds,
      databaseName: FIXED_DATABASE_NAME,
      instanceType: InstanceType.of(
        InstanceClass.BURSTABLE4_GRAVITON,
        InstanceSize.SMALL
      ),
      vpc: vpc,
      vpcSubnets: subnetSelection,
      securityGroups: [securityGroup],
    });
    dbSocketAddress = (db as DatabaseInstance).instanceEndpoint.socketAddress;
    dbSecret = (db as DatabaseInstance).secret!;

    // the REMS user and db will have been already created as part of the DB instance/cluster construction
    const remsDatabaseUrl = `postgresql://${dbSocketAddress}/rems?user=${FIXED_DATABASE_USER}&password=${dbSecret.secretValueFromJson(
      "password"
    )}`;

    return [db, remsDatabaseUrl];
  }

  /**
   * Add a command lambda that can start REMS tasks in the cluster for the purposes of
   * executing REMS docker commands.
   *
   * @param vpc
   * @param subnetSelection
   * @param cluster
   * @param clusterLogGroup
   * @param taskDefinition
   * @param taskSecurityGroups
   * @private
   */
  private addCommandLambda(
    vpc: IVpc,
    subnetSelection: SubnetSelection,
    cluster: Cluster,
    clusterLogGroup: LogGroup,
    taskDefinition: TaskDefinition,
    taskSecurityGroups: SecurityGroup[]
  ): DockerImageFunction {
    const commandLambdaSecurityGroup = new SecurityGroup(
      this,
      "CommandLambdaSecurityGroup",
      {
        vpc: vpc,
        // this needs outbound to be able to make the AWS calls it needs (don't want to add PrivateLink)
        allowAllOutbound: true,
      }
    );

    const dockerImageFolder = path.join(
      __dirname,
      "rems-command-invoke-lambda-docker-image"
    );

    // this command lambda does almost nothing itself - all it does is trigger the creation of
    // a fargate task and then tracks that to completion - and returns the logs path
    // so it needs very little memory - but up to 14 mins runtime as sometimes the fargate
    // tasks are a bit slow
    const f = new DockerImageFunction(this, "CommandLambda", {
      memorySize: 128,
      code: DockerImageCode.fromImageAsset(dockerImageFolder),
      vpcSubnets: subnetSelection,
      vpc: vpc,
      securityGroups: [commandLambdaSecurityGroup],
      timeout: Duration.minutes(14),
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        CLUSTER_LOG_GROUP_NAME: clusterLogGroup.logGroupName,
        TASK_DEFINITION_ARN: taskDefinition.taskDefinitionArn,
        CONTAINER_NAME: FIXED_CONTAINER_NAME,
        // we are passing to the lambda the subnets and security groups that need to be used
        // by the Fargate task it will invoke
        SUBNETS: vpc
          .selectSubnets(subnetSelection)
          .subnets.map((s) => s.subnetId)
          .join(",")!,
        SECURITY_GROUPS: taskSecurityGroups
          .map((sg) => sg.securityGroupId)
          .join(",")!,
      },
    });

    f.role?.attachInlinePolicy(
      new Policy(this, "CommandTasksPolicy", {
        statements: [
          new PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: ["arn:aws:secretsmanager:*:*:secret:Rems*"],
          }),
          // restricted to running our task only on our cluster
          new PolicyStatement({
            actions: ["ecs:RunTask"],
            resources: [taskDefinition.taskDefinitionArn],
            conditions: {
              ArnEquals: {
                "ecs:Cluster": cluster.clusterArn,
              },
            },
          }),
          // restricted to describing tasks only on our cluster
          new PolicyStatement({
            actions: ["ecs:DescribeTasks"],
            resources: ["*"],
            conditions: {
              ArnEquals: {
                "ecs:Cluster": cluster.clusterArn,
              },
            },
          }),
          // give the ability to invoke the task
          new PolicyStatement({
            actions: ["iam:PassRole"],
            resources: [
              taskDefinition.executionRole?.roleArn!,
              taskDefinition.taskRole.roleArn!,
            ],
          }),
        ],
      })
    );

    return f;
  }
}
