# REMS

A CDK stack and Dockerfile for deploying REMS using configuration
suitable for UMCCR.

The CDK stack sets up a standalone VPC with the service running
in isolated subnets and only with only access to AWS services via
PrivateLink. The absence of a NAT gateway means that this is roughly the
same cost (though this cost blows out the more AWS private links you
need to add).

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
