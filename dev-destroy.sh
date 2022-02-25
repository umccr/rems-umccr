#!/bin/zsh

set -o errexit

echo Installing stack ...

# for dev work we use the pre-canned settings of the dev account
CERT=$(aws ssm get-parameter --name "cert_apse2_arn" --output text --query "Parameter.Value")
DOMAINZONE="Z13ZMZH3CGX773"
OIDCCLIENTID="{{resolve:secretsmanager:dev/didact/registry-test.biocommons.org.au:SecretString:client_id}}"
OIDCCLIENTSECRET="{{resolve:secretsmanager:dev/didact/registry-test.biocommons.org.au:SecretString:client_secret}}"
RDSSECRET="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:RemsRdsPassword"

npx cdk destroy \
   --toolkit-stack-name CDKToolkitNew \
   --context "secretName=$RDSSECRET" \
   --context "cert=$CERT"
