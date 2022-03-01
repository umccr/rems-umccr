#!/bin/zsh

set -o errexit

# the namespace must pre-exist as a CloudMap namespace in the account of deployment
CLOUDMAPNAMESPACE=$(<rems-cloudmap-namespace.txt)

LAMBDA_ARN=$(aws servicediscovery discover-instances \
           --namespace-name "$CLOUDMAPNAMESPACE" \
           --service-name "rems" \
           --output text --query "Instances[].Attributes.lambdaArn")

echo "Task command executions can take a while - this CLI tool will wait (possibly 10 minutes)"

aws lambda invoke --function-name "$LAMBDA_ARN" \
           --cli-read-timeout 600 \
           --cli-binary-format raw-in-base64-out \
           --payload "{\"cmd\":\"$1\"}" \
           response.json

cat response.json
