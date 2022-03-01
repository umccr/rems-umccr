import {
  CfnOutput,
  Duration,
  Fn,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  SecurityGroup,
  SubnetSelection,
  SubnetType,
} from "aws-cdk-lib/aws-ec2";
import {
  AuroraPostgresEngineVersion,
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import { DockerServiceWithHttpsLoadBalancerConstruct } from "./lib/docker-service-with-https-load-balancer-construct";
import { PublicAndNatVpc } from "./lib/network/nat-vpc";
import { HttpNamespace, Service } from "aws-cdk-lib/aws-servicediscovery";
import { TaskDefinition, Cluster } from "aws-cdk-lib/aws-ecs";
import { Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";

// these are settings for the database *within* the RDS instance, and the postgres user name
// they really shouldn't need to be changed but I will define them here as constants in case
const FIXED_DATABASE_NAME = "rems";
const FIXED_DATABASE_USER = "rems";
const FIXED_CONTAINER_NAME = "rems";
const FIXED_SERVICE_NAME = "rems";

export class RemsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const cloudMapNamespace = this.node.tryGetContext("cloudMapNamespace");
    const rdsSecretName = this.node.tryGetContext("rdsSecretName");
    const hostedPrefix = this.node.tryGetContext("hostedPrefix");
    const hostedZoneName = this.node.tryGetContext("hostedZoneName");
    const hostedZoneCert = this.node.tryGetContext("hostedZoneCert");
    const oidcMetadataUrl = this.node.tryGetContext("oidcMetadataUrl");
    const oidcClientId = this.node.tryGetContext("oidcClientId");
    const oidcClientSecret = this.node.tryGetContext("oidcClientSecret");

    if (
      !cloudMapNamespace ||
      !rdsSecretName ||
      !hostedPrefix ||
      !hostedZoneName ||
      !hostedZoneCert
    )
      throw new Error(
        "Context values must be passed into CDK invocation to set some important mandatory parameters"
      );

    // we are going to try to make a set of services isolated in a private subnet
    // and only able to access the outside world through the connected load balancer
    // this sets up both the public and isolated subnets
    // we also add in private links to enable the required AWS service calls for fargate etc
    /*const vpc = new PublicAndIsolatedVpc(this, 'Vpc', {
            awsPrivateLinksServices: [
                // mandatory private links to support fargate
                InterfaceVpcEndpointAwsService.ECR_DOCKER,
                InterfaceVpcEndpointAwsService.ECR,
                InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
                // used for passwords etc
                InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
                InterfaceVpcEndpointAwsService.SSM
            ],
        });*/
    const vpc = new PublicAndNatVpc(this, "Vpc", {});
    const subnetSelection: SubnetSelection = {
      subnetType: SubnetType.PRIVATE_WITH_NAT,
    };

    const dbMasterCredentials = Credentials.fromPassword(
      FIXED_DATABASE_USER,
      SecretValue.secretsManager(rdsSecretName)
    );

    let db: DatabaseCluster | DatabaseInstance;
    let dbSocketAddress: string;

    if (false) {
      db = new DatabaseCluster(this, "Database", {
        removalPolicy: RemovalPolicy.DESTROY,
        engine: DatabaseClusterEngine.auroraPostgres({
          version: AuroraPostgresEngineVersion.VER_13_4,
        }),
        credentials: dbMasterCredentials,
        defaultDatabaseName: FIXED_DATABASE_NAME,
        instanceProps: {
          instanceType: InstanceType.of(
            InstanceClass.BURSTABLE4_GRAVITON,
            InstanceSize.MEDIUM
          ),
          vpcSubnets: subnetSelection,
          vpc: vpc,
        },
      });
      dbSocketAddress = (db as DatabaseCluster).clusterEndpoint.socketAddress;
    } else {
      db = new DatabaseInstance(this, "Database", {
        removalPolicy: RemovalPolicy.DESTROY,
        engine: DatabaseInstanceEngine.postgres({
          version: PostgresEngineVersion.VER_13,
        }),
        credentials: dbMasterCredentials,
        databaseName: FIXED_DATABASE_NAME,
        instanceType: InstanceType.of(
          InstanceClass.BURSTABLE4_GRAVITON,
          InstanceSize.MEDIUM
        ),
        vpc: vpc,
        vpcSubnets: subnetSelection,
      });
      dbSocketAddress = (db as DatabaseInstance).instanceEndpoint.socketAddress;
    }

    //const masterDatabaseUrl = `postgresql://${dbSocketAddress}/postgres?user=${dbMasterCredentials.username}&password=${dbMasterCredentials.password}`;

    /*const dbInitialiser = new RdsInitialiser(this, "RdsInit", {
      databaseUrl: masterDatabaseUrl,
      fnLogRetention: RetentionDays.ONE_DAY,
      fnCode: DockerImageCode.fromImageAsset(
        `${__dirname}/rds-initialiser-docker-image`,
        {}
      ),
      fnTimeout: Duration.minutes(1),
      fnSecurityGroups: [],
      vpc,
      subnetsSelection: subnetSelection,
      databaseSecretName: secretName,
    });
    // manage resources dependency
    dbInitialiser.customResource.node.addDependency(db);
    // allow the initializer function to connect to the RDS instance
    db.connections.allowDefaultPortFrom(dbInitialiser.function);

     */

    db.connections.allowDefaultPortFromAnyIpv4();

    const dockerImageFolder = path.join(__dirname, "rems-docker-image");

    const asset = new DockerImageAsset(this, "RemsDockerImage", {
      directory: dockerImageFolder,
      buildArgs: {},
    });

    const remsContainerSecurityGroup = new SecurityGroup(
      this,
      "RemsContainerSG",
      {
        vpc,
        allowAllOutbound: true,
      }
    );

    // the REMS database will have been constructed in the initialise function and
    // been given the correct permissions for the user rems
    //const dbRemsCredentials = Credentials.fromPassword(
    //  "rems",
    //  SecretValue.secretsManager(secretName)
    //);
    const remsDatabaseUrl = `postgresql://${dbSocketAddress}/rems?user=${dbMasterCredentials.username}&password=${dbMasterCredentials.password}`;

    const isolated = new DockerServiceWithHttpsLoadBalancerConstruct(
      this,
      "Isolated",
      {
        vpc: vpc,
        hostedPrefix: hostedPrefix,
        hostedZoneName: hostedZoneName,
        hostedZoneCertArn: hostedZoneCert,
        imageAsset: asset,
        memoryLimitMiB: 2048,
        cpu: 1024,
        desiredCount: 1,
        containerName: FIXED_CONTAINER_NAME,
        containerSecurityGroup: remsContainerSecurityGroup,
        healthCheckPath: "/",
        environment: {
          // rather than embed these in the config.edn that is checked into git -
          // we use the mechanism by which these settings can be made using environment variables
          // and then allow these values to be fetched from parameterstore/secrets etc
          // the *key* names here must match the config setting names from the EDN
          DATABASE_URL: remsDatabaseUrl,
          OIDC_METADATA_URL: oidcMetadataUrl,
          OIDC_CLIENT_ID: oidcClientId,
          OIDC_CLIENT_SECRET: oidcClientSecret,
          PUBLIC_URL: `https://${hostedPrefix}.${hostedZoneName}/`,
        },
      }
    );

    const commandFunction = this.addCommandLambda(
      vpc,
      subnetSelection,
      isolated.cluster,
      isolated.service.taskDefinition,
      [remsContainerSecurityGroup]
    );

    commandFunction.role?.attachInlinePolicy(
      new Policy(this, "CommandTasksPolicy", {
        statements: [
          // restricted to running our task only on our cluster
          new PolicyStatement({
            actions: ["ecs:RunTask"],
            resources: [isolated.service.taskDefinition.taskDefinitionArn],
            conditions: {
              ArnEquals: {
                "ecs:Cluster": isolated.cluster.clusterArn,
              },
            },
          }),
          // restricted to describing tasks only on our cluster
          new PolicyStatement({
            actions: ["ecs:DescribeTasks"],
            resources: ["*"],
            conditions: {
              ArnEquals: {
                "ecs:Cluster": isolated.cluster.clusterArn,
              },
            },
          }),
          // give the ability to invoke the task
          new PolicyStatement({
            actions: ["iam:PassRole"],
            resources: [
              isolated.service.taskDefinition.executionRole?.roleArn!,
              isolated.service.taskDefinition.taskRole.roleArn!,
            ],
          }),
        ],
      })
    );

    const namespace = HttpNamespace.fromHttpNamespaceAttributes(
      this,
      "Namespace",
      {
        // this is a bug in the CDK definitions - this field is optional but not defined that way
        // passing an empty string does work
        namespaceArn: "",
        namespaceId: "ns-mjt63c4ppdrly4jd",
        namespaceName: cloudMapNamespace,
      }
    );

    const service = new Service(this, "Service", {
      namespace: namespace,
      name: FIXED_SERVICE_NAME,
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
      value: isolated.cluster.clusterArn,
    });
    new CfnOutput(this, "TaskDefinitionArn", {
      value: isolated.service.taskDefinition.taskDefinitionArn,
    });
  }

  /**
   * Add a command lambda that can start REMS tasks in the cluster for the purposes of
   * executing REMS docker commands.
   *
   * @param vpc
   * @param subnetSelection
   * @param cluster
   * @param taskDefinition
   * @param taskSecurityGroups
   * @private
   */
  private addCommandLambda(
    vpc: IVpc,
    subnetSelection: SubnetSelection,
    cluster: Cluster,
    taskDefinition: TaskDefinition,
    taskSecurityGroups: SecurityGroup[]
  ): DockerImageFunction {
    const dockerImageFolder = path.join(
      __dirname,
      "rems-command-invoke-docker-image"
    );

    const commandLambdaSecurityGroup = new SecurityGroup(
      this,
      "CommandLambdaSecurityGroup",
      {
        vpc: vpc,
        allowAllOutbound: true,
      }
    );

    return new DockerImageFunction(this, "CommandLambda", {
      memorySize: 128,
      code: DockerImageCode.fromImageAsset(dockerImageFolder),
      vpcSubnets: subnetSelection,
      vpc: vpc,
      securityGroups: [commandLambdaSecurityGroup],
      timeout: Duration.minutes(14),
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        TASK_DEFINITION_ARN: taskDefinition.taskDefinitionArn,
        CONTAINER_NAME: FIXED_CONTAINER_NAME,
        SUBNETS: vpc
          .selectSubnets(subnetSelection)
          .subnets.map((s) => s.subnetId)
          .join(",")!,
        SECURITY_GROUPS: taskSecurityGroups
          .map((sg) => sg.securityGroupId)
          .join(",")!,
      },
    });
  }
}
