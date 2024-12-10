import { CfnOutput, Stage, StageProps, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import { RemsSettings } from "./application/rems-settings";
import { RemsStack } from "./application/rems-stack";
import { TAG_STACK_VALUE } from "./rems-constants";

export class RemsBuildStage extends Stage {
  // the output of what we believe will be the deployed REMS url (e.g. https://rems.dc.umccr.org)
  public readonly deployUrlOutput: CfnOutput;

  constructor(scope: Construct, id: string, props: StageProps & RemsSettings) {
    super(scope, id, props);

    const stack = new RemsStack(this, "Rems", props);

    Tags.of(stack).add("Stack", TAG_STACK_VALUE);

    this.deployUrlOutput = stack.deployUrlOutput;
  }
}
