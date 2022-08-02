import {
  pipelines,
  Stack,
  StackProps,
  Stage,
  StageProps,
  Token,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { RemsBuildStage } from "./rems-build-stage";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { readFileSync } from "fs";
import { STACK_DESCRIPTION, TAG_STACK_VALUE } from "./rems-constants";

/**
 * Stack to hold the self mutating pipeline, and all the relevant settings for deployments
 */
export class RemsPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    super.tags.setTag("Stack", TAG_STACK_VALUE);

    this.templateOptions.description = STACK_DESCRIPTION;

    // these are *build* parameters that we either want to re-use across lots of stacks, or are
    // 'sensitive' enough we don't want them checked into Git - but not sensitive enough to record as a Secret
    const codeStarArn = StringParameter.valueFromLookup(
      this,
      "codestar_github_arn"
    );
    const nctsClientId = StringParameter.valueFromLookup(
      this,
      "ncts_client_id"
    );
    const nctsClientSecret = StringParameter.valueFromLookup(
      this,
      "ncts_client_secret"
    );

    const pipeline = new pipelines.CodePipeline(this, "Pipeline", {
      // should normally be commented out - only use when debugging pipeline itself
      // selfMutation: false,
      // turned on because our stack makes docker assets
      dockerEnabledForSynth: true,
      dockerEnabledForSelfMutation: true,
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
          // need to think how to get pre-commit to run in CI given .git is not present
          // "pip install pre-commit",
          // "git init . && pre-commit run --all-files",
          "npm ci",
          // our cdk is configured to use ts-node - so we don't need any build step - just synth
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

    const devStage = new RemsBuildStage(this, "Dev", {
      env: {
        account: "843407916570",
        region: "ap-southeast-2",
      },
      cloudMapNamespace: cloudMapNamespace,
      cloudMapId: cloudMapId,
      cloudMapServiceName: cloudMapServiceName,
      hostedPrefix: hostedPrefix,
      smtpMailFrom: smtpMailFrom,
      memoryLimitMiB: 2048,
    });

    const prodStage = new RemsBuildStage(this, "Prod", {
      env: {
        account: "472057503814",
        region: "ap-southeast-2",
      },
      cloudMapNamespace: cloudMapNamespace,
      cloudMapId: cloudMapId,
      cloudMapServiceName: cloudMapServiceName,
      hostedPrefix: hostedPrefix,
      smtpMailFrom: smtpMailFrom,
      memoryLimitMiB: 2048,
    });

    pipeline.addStage(devStage, {
      post: [
        new pipelines.ShellStep("Validate Endpoint", {
          envFromCfnOutputs: {
            DEPLOYED_URL: devStage.deployUrlOutput,
          },
          commands: [
            "echo DEPLOYED_URL",
            // "cd test/onto-cli",
            // "npm ci",
            // `npm run test -- "$FHIR_BASE_URL"`,
          ],
        }),
      ],
    });

    pipeline.addStage(prodStage, {
      pre: [new pipelines.ManualApprovalStep("PromoteToProd")],
    });
  }
}
