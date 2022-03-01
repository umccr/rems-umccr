import { createHash } from "crypto";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { Duration, Stack } from "aws-cdk-lib";
import {
  ISecurityGroup,
  IVpc,
  SecurityGroup,
  SubnetSelection,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  AwsSdkCall,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export interface Props {
  vpc: IVpc;
  subnetsSelection: SubnetSelection;
  fnSecurityGroups: ISecurityGroup[];
  fnTimeout: Duration;
  fnCode: DockerImageCode;
  fnLogRetention: RetentionDays;
  fnMemorySize?: number;

  databaseUrl: string;
  databaseSecretName: string;
}

/**
 * A Custom resource that executes an RDS initialisation lambda once as the RDS instance is created.
 */
export class RdsInitialiser extends Construct {
  public readonly response: string;
  public readonly customResource: AwsCustomResource;
  public readonly function: DockerImageFunction;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const stack = Stack.of(this);

    const fnSg = new SecurityGroup(this, "ResourceInitializerFnSg", {
      securityGroupName: `${id}ResourceInitializerFnSg`,
      vpc: props.vpc,
      allowAllOutbound: true,
    });

    const fn = new DockerImageFunction(this, "ResourceInitializerFn", {
      memorySize: props.fnMemorySize || 128,
      functionName: `${id}-ResInit${stack.stackName}`,
      code: props.fnCode,
      vpcSubnets: props.vpc.selectSubnets(props.subnetsSelection),
      vpc: props.vpc,
      securityGroups: [fnSg, ...props.fnSecurityGroups],
      timeout: props.fnTimeout,
      logRetention: props.fnLogRetention,
      environment: {
        DATABASE_URL: props.databaseUrl,
        // PGUSER
        // PGHOST
        // PGPORT
        // PGDATABASE
        // PGPASSWORD
      },
      // as far as networking goes for this lambda - all we need is the ability to make the SQL connect
      // so we deliberately be pretty open here and let the outer stack decide on where we get put
      allowAllOutbound: true,
      allowPublicSubnet: true,
    });

    const payloadHashPrefix = createHash("md5")
      .update(props.databaseUrl)
      .digest("hex")
      .substring(0, 6);

    const sdkCall: AwsSdkCall = {
      service: "Lambda",
      action: "invoke",
      parameters: {
        FunctionName: fn.functionName,
        Payload: JSON.stringify({ secretName: props.databaseSecretName }),
      },
      physicalResourceId: PhysicalResourceId.of(
        `${id}-AwsSdkCall-${fn.currentVersion.version + payloadHashPrefix}`
      ),
    };

    const customResourceFnRole = new Role(this, "AwsCustomResourceRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    const secret = Secret.fromSecretPartialArn(
      this,
      "Secret",
      props.databaseSecretName
    );

    secret.grantRead(customResourceFnRole);
    secret.grantRead(fn);

    customResourceFnRole.addToPolicy(
      new PolicyStatement({
        resources: [
          `arn:aws:lambda:${stack.region}:${stack.account}:function:*-ResInit${stack.stackName}`,
        ],
        actions: ["lambda:InvokeFunction"],
      })
    );
    this.customResource = new AwsCustomResource(this, "AwsCustomResource", {
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      onUpdate: sdkCall,
      timeout: Duration.minutes(1),
      role: customResourceFnRole,
    });

    this.response = this.customResource.getResponseField("Payload");

    this.function = fn;
  }
}
