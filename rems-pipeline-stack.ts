import { pipelines, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { RemsBuildStage } from "./rems-build-stage";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { readFileSync } from "fs";
import { STACK_DESCRIPTION, TAG_STACK_VALUE } from "./rems-constants";
import { LinuxArmBuildImage } from "aws-cdk-lib/aws-codebuild";

/**
 * Stack to hold the self mutating pipeline, and all the relevant settings for deployments
 */
export class RemsPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.tags.setTag("Stack", TAG_STACK_VALUE);
    this.templateOptions.description = STACK_DESCRIPTION;

    // these are *build* parameters that we either want to re-use across lots of stacks, or are
    // 'sensitive' enough we don't want them checked into Git - but not sensitive enough to record as a Secret
    // NOTE: these are looked up at the *build pipeline deploy* stage
    const codeStarArn = StringParameter.valueFromLookup(
      this,
      "codestar_github_arn"
    );

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      // should normally be commented out - only use when debugging pipeline itself
      // selfMutation: false,
      // turned on because our stack makes docker assets
      dockerEnabledForSynth: true,
      dockerEnabledForSelfMutation: true,
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
        },
      },
      synth: new pipelines.CodeBuildStep("Synth", {
        // Use a connection created using the AWS console to authenticate to GitHub
        // Other sources are available.
        input: pipelines.CodePipelineSource.connection(
          "umccr/rems-umccr",
          "main",
          {
            connectionArn: codeStarArn,
          }
        ),
        env: {},
        commands: [
          "n 22",
          "npm ci",
          // our cdk is configured to use ts-node - so we don't need any typescript build step - just synth
          "npx cdk synth",
        ],
        rolePolicyStatements: [
          new PolicyStatement({
            actions: ["sts:AssumeRole"],
            resources: ["*"],
            conditions: {
              StringEquals: {
                "iam:ResourceTag/aws-cdk:bootstrap-role": "lookup",
              },
            },
          }),
        ],
      }),
      crossAccountKeys: true,
    });

    // so the file with our namespace settings is the master definition of our CloudMap - so we fetch
    // the settings from that
    // NOTE: it is not clear that this setting would pick up a change in the file - or whether it only
    // takes the value on build pipeline deploy
    const cloudMapLines = readFileSync("./rems-cloudmap-namespace.txt", {
      encoding: "utf-8",
    }).split("\n");

    const cloudMapNamespace = cloudMapLines[0].trim();
    const cloudMapId = cloudMapLines[1].trim();
    const cloudMapServiceName = cloudMapLines[2].trim();
    const hostedPrefix = "rems";
    const smtpMailFrom = "rems@umccr.org";

    const dcStage = new RemsBuildStage(this, "DataControl", {
      env: {
        account: "503561413336",
        region: "ap-southeast-2",
      },
      cloudMapNamespace: cloudMapNamespace,
      cloudMapId: cloudMapId,
      cloudMapServiceName: cloudMapServiceName,
      hostedPrefix: hostedPrefix,
      smtpMailFrom: smtpMailFrom,
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    pipeline.addStage(dcStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
