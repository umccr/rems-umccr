import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RemsPipelineStack } from "./rems-pipeline-stack";

const AWS_BUILD_ACCOUNT = "383856791668";
const AWS_BUILD_REGION = "ap-southeast-2";

const app = new cdk.App();

new RemsPipelineStack(app, "RemsPipelineStack", {
  // the pipeline can only be deployed to 'build' and this should only happen once
  env: {
    account: AWS_BUILD_ACCOUNT,
    region: AWS_BUILD_REGION,
  },
  tags: {
    Stack: "Rems",
  },
});
