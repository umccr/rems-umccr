import { Construct } from "constructs";
import { GatewayVpcEndpointAwsService, Vpc } from "aws-cdk-lib/aws-ec2";

type Props = {};

/**
 * Construct a VPC with a public subnets and private subnets through a single NAT.
 */
export class PublicAndNatVpc extends Vpc {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, {
      maxAzs: 99,
      natGateways: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      // I can't think of any reason to *not* do this - these gateways are free
      gatewayEndpoints: {
        S3: {
          service: GatewayVpcEndpointAwsService.S3,
        },
        Dynamo: {
          service: GatewayVpcEndpointAwsService.DYNAMODB,
        },
      },
    });
  }
}
