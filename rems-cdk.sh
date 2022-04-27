#!/bin/zsh

set -o errexit

# we can fetch these settings however we want - depending on our security settings - feel free to replace
# with any technique that makes sense for you
# these are the REMS settings that are almost certainly going to need to change for
# each deployment (i.e the domain name).
# there are other REMS settings that you might like to change (REMS features etc) - for those
# see iac/rems-docker-image/config.edn

# the namespace must pre-exist as a CloudMap namespace in the account of deployment
# (we also have an annoying CDK bug that means we *also* have to specify the id - hopefully this
#  is fixed and we can just lookup by name)
CLOUD_MAP_NAMESPACE=$(<rems-cloudmap-namespace.txt)
CLOUD_MAP_ID="ns-mjt63c4ppdrly4jd"

# if your git is private and you don't mind this info leakage we could embed directly
# here are some commented out (non-working) examples of the content
# HOSTED_PREFIX="rems"
# HOSTED_ZONE_NAME="dev.umccr.org"
# HOSTED_ZONE_CERT="arn:aws:acm:ap-southeast-2:843407916570:certificate/fb543730-282d-46c9-8553-512d18cf5a6b"
# OIDC_METADATA_URL="https://accounts.google.com/.well-known/openid-configuration"
# OIDC_CLIENT_ID="(client id)"
# OIDC_CLIENT_SECRET="(client secret)"

HOSTED_PREFIX="hgpp-rems"
SMTP_HOST="email-smtp.ap-southeast-2.amazonaws.com"
SMTP_MAIL_FROM="rems@umccr.org"

# in the case of wanting a db cluster and two instances (across availability zones) - add
#    --context "highlyAvailable=yes"

(cd iac; npx cdk "$@" \
   --toolkit-stack-name CDKToolkitNew \
   --context "cloudMapNamespace=$CLOUD_MAP_NAMESPACE" \
   --context "cloudMapId=$CLOUD_MAP_ID" \
   --context "hostedPrefix=$HOSTED_PREFIX" \
   --context "hostedZoneName=$(aws ssm get-parameter --name 'hosted_zone_name' --output text --query 'Parameter.Value')" \
   --context "hostedZoneCert=$(aws ssm get-parameter --name 'cert_apse2_arn' --output text --query 'Parameter.Value')" \
   --context "oidcMetadataUrl=$(aws ssm get-parameter --name '/rems/auth0/oauth_metadata_url' --output text --query 'Parameter.Value')" \
   --context "oidcClientId=$(aws ssm get-parameter --name '/rems/auth0/oauth_client_id' --output text --query 'Parameter.Value')" \
   --context "oidcClientSecret=$(aws ssm get-parameter --name '/rems/auth0/oauth_client_secret' --output text --query 'Parameter.Value')" \
   --context "smtpHost=$SMTP_HOST" \
   --context "smtpMailFrom=$SMTP_MAIL_FROM" \
   --context "smtpUser=$(aws ssm get-parameter --name 'smtp_send_user' --output text --query 'Parameter.Value')" \
   --context "smtpPassword=$(aws ssm get-parameter --name 'smtp_send_password' --output text --query 'Parameter.Value')" \
   )
