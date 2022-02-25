#!/bin/zsh

set -o errexit

echo Installing stack ...

# we can fetch these settings however we want - depending on our security settings
# for private git, we could embed directly
# for public git, we choose to use parameter store
CERT=$(aws ssm get-parameter --name "cert_apse2_arn" --output text --query "Parameter.Value")
OIDCMETADATAURL="https://accounts.google.com/.well-known/openid-configuration"
OIDCCLIENTID=$(aws ssm get-parameter --name "/rems/google/oauth_client_id" --output text --query "Parameter.Value")
OIDCCLIENTSECRET=$(aws ssm get-parameter --name "/rems/google/oauth_client_secret" --output text --query "Parameter.Value")

# for the RDS password - we insist that the password is set using a secret
RDSSECRET="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:RemsRdsPassword"

npx cdk deploy \
   --toolkit-stack-name CDKToolkitNew \
   --context "secretName=$RDSSECRET" \
   --context "cert=$CERT" \
   --context "oidcMetadataUrl=$OIDCMETADATAURL" \
   --context "oidcClientId=$OIDCCLIENTID" \
   --context "oidcClientSecret=$OIDCCLIENTSECRET"
