import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RemsStack } from "../application/rems-stack";
import { STACK_DESCRIPTION, TAG_STACK_VALUE } from "../rems-constants";
import { readFileSync } from "node:fs";

const app = new cdk.App();

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

/**
 * This is a stack that can be deployed only in the dev account - and direct from
 * a developers desktop for quick turnaround on feature development.
 */
new RemsStack(app, "RemsLocalDevTestStack", {
  description: STACK_DESCRIPTION,
  tags: {
    "umccr-org:Stack": TAG_STACK_VALUE,
    "umccr-org:Product": TAG_STACK_VALUE,
  },
  env: {
    account: "843407916570",
    region: "ap-southeast-2",
  },
  isDevelopment: true,
  cloudMapNamespace: cloudMapNamespace,
  cloudMapId: cloudMapId,
  cloudMapServiceName: cloudMapServiceName,
  smtpMailFrom: "test@umccr.org",
  memoryLimitMiB: 4096,
  cpu: 1024,
  hostedPrefix: "rems",
});
