import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
  Token,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  InterfaceVpcEndpointAwsService,
  Port,
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
import { PublicAndIsolatedVpc } from "./isolated-vpc";
import { RdsInitialiser } from "./rds-initialiser";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import { IsolatedDockerServiceWithLoadBalancerConstruct } from "./isolated-docker-service-with-load-balancer-construct";
import { PublicAndNatVpc } from "./nat-vpc";

export class RemsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const secretName = this.node.tryGetContext("secretName");
    const cert = this.node.tryGetContext("cert");
    const oidcMetadataUrl = this.node.tryGetContext("oidcMetadataUrl");
    const oidcClientId = this.node.tryGetContext("oidcClientId");
    const oidcClientSecret = this.node.tryGetContext("oidcClientSecret");

    if (!secretName || !cert)
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
      "rems",
      SecretValue.secretsManager(secretName)
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
        defaultDatabaseName: "rems",
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
        databaseName: "rems",
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

    const dockerImageFolder = path.join(__dirname, "..", "rems-docker-image");

    const asset = new DockerImageAsset(this, "RemsDockerImage", {
      directory: dockerImageFolder,
      buildArgs: {},
    });

    // the REMS database will have been constructed in the initialise function and
    // been given the correct permissions for the user rems
    //const dbRemsCredentials = Credentials.fromPassword(
    //  "rems",
    //  SecretValue.secretsManager(secretName)
    //);
    const remsDatabaseUrl = `postgresql://${dbSocketAddress}/rems?user=${dbMasterCredentials.username}&password=${dbMasterCredentials.password}`;

    const isolated = new IsolatedDockerServiceWithLoadBalancerConstruct(
      this,
      "Isolated",
      {
        vpc: vpc,
        hostPrefix: "rems",
        imageAsset: asset,
        memoryLimitMiB: 2048,
        cpu: 1024,
        desiredCount: 1,
        // healthCheckPath: "/",
        environment: {
          // rather than embed these in the config.edn that is checked into git -
          // we use the mechanism by which these settings can be made using environment variables
          // and then allow these values to be fetched from parameterstore/secrets etc
          DATABASE_URL: remsDatabaseUrl,
          OIDC_METADATA_URL: oidcMetadataUrl,
          OIDC_CLIENT_ID: oidcClientId,
          OIDC_CLIENT_SECRET: oidcClientSecret,
        },
      }
    );

    // new CfnOutput(this, "RdsInitFnResponse", {
    //   value: Token.asString(dbInitialiser.response),
    //  });

    new CfnOutput(this, "RemsDatabaseUrl", {
      value: remsDatabaseUrl,
    });
    new CfnOutput(this, "ClusterArn", {
      value: isolated.cluster.clusterArn,
    });
    new CfnOutput(this, "TaskDefinitionArn", {
      value: isolated.service.taskDefinition.networkMode,
    });
  }
}
