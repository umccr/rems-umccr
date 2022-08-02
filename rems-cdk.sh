#!/bin/zsh

set -o errexit

# the namespace must pre-exist as a CloudMap namespace in the account of deployment
# (we also have an annoying CDK bug that means we *also* have to specify the id - hopefully this
#  is fixed and we can just lookup by name)
CLOUD_MAP_NAMESPACE=$(head -1 rems-cloudmap-namespace.txt)
CLOUD_MAP_ID=$(head -2 rems-cloudmap-namespace.txt | tail -1)

HOSTED_PREFIX="rems"
SMTP_HOST="email-smtp.ap-southeast-2.amazonaws.com"
SMTP_MAIL_FROM="rems@umccr.org"

(cd iac; npx cdk "$@" \
   --toolkit-stack-name CDKToolkitNew \
   --context "cloudMapNamespace=$CLOUD_MAP_NAMESPACE" \
   --context "cloudMapId=$CLOUD_MAP_ID" \
   --context "hostedPrefix=$HOSTED_PREFIX" \
   --context "hostedZoneName=$(aws ssm get-parameter --name 'hosted_zone_name' --output text --query 'Parameter.Value')" \
   --context "hostedZoneCert=$(aws ssm get-parameter --name 'cert_apse2_arn' --output text --query 'Parameter.Value')" \
   --context "oidcMetadataUrl=$(aws ssm get-parameter --name '/rems/google/oauth_metadata_url' --output text --query 'Parameter.Value')" \
   --context "oidcClientId=$(aws ssm get-parameter --name '/rems/google/oauth_client_id' --output text --query 'Parameter.Value')" \
   --context "oidcClientSecret=$(aws ssm get-parameter --name '/rems/google/oauth_client_secret' --output text --query 'Parameter.Value')" \
   --context "smtpHost=$SMTP_HOST" \
   --context "smtpMailFrom=$SMTP_MAIL_FROM" \
   --context "smtpUser=$(aws ssm get-parameter --name 'smtp_send_user' --output text --query 'Parameter.Value')" \
   --context "smtpPassword=$(aws ssm get-parameter --name 'smtp_send_password' --output text --query 'Parameter.Value')" \
   )
