#!/bin/zsh

set -o errexit

# we can fetch these settings however we want - depending on our security settings - feel free to replace
# with any technique that makes sense for you
# here are the REMS settings that are almost certainly going to need to change for
# each deployment (i.e the domain name).
# there are other REMS settings that you might like to change (REMS features etc) - for those
# see iac/rems-docker-image/config.edn

# the namespace must pre-exist as a CloudMap namespace in the account of deployment
CLOUDMAPNAMESPACE=$(<rems-cloudmap-namespace.txt)

# for the RDS password - we insist that the password is set using a secret
RDSSECRETNAME="arn:aws:secretsmanager:ap-southeast-2:843407916570:secret:RemsRdsPassword"

# for private git, we could embed directly
# here are some commented out (non-working) examples of the content
# HOSTEDPREFIX="rems"
# HOSTEDZONENAME="umccr.org"
# HOSTEDZONECERT="arn:aws:acm:ap-southeast-2:843407916570:certificate/fb543730-282d-46c9-8553-512d18cf5a6b"
# OIDCMETADATAURL="https://accounts.google.com/.well-known/openid-configuration"
# OIDCCLIENTID="vfdddfsfsd"
# OIDCCLIENTSECRET="rtertetet"

# for public git, we choose to use parameter store
HOSTEDPREFIX="rems"
HOSTEDZONENAME=$(aws ssm get-parameter --name "hosted_zone_name" --output text --query "Parameter.Value")
HOSTEDZONECERT=$(aws ssm get-parameter --name "cert_apse2_arn" --output text --query "Parameter.Value")
OIDCMETADATAURL="https://accounts.google.com/.well-known/openid-configuration"
OIDCCLIENTID=$(aws ssm get-parameter --name "/rems/google/oauth_client_id" --output text --query "Parameter.Value")
OIDCCLIENTSECRET=$(aws ssm get-parameter --name "/rems/google/oauth_client_secret" --output text --query "Parameter.Value")


(cd iac; npx cdk "$@" \
   --toolkit-stack-name CDKToolkitNew \
   --context "cloudMapNamespace=$CLOUDMAPNAMESPACE" \
   --context "rdsSecretName=$RDSSECRETNAME" \
   --context "hostedPrefix=$HOSTEDPREFIX" \
   --context "hostedZoneName=$HOSTEDZONENAME" \
   --context "hostedZoneCert=$HOSTEDZONECERT" \
   --context "oidcMetadataUrl=$OIDCMETADATAURL" \
   --context "oidcClientId=$OIDCCLIENTID" \
   --context "oidcClientSecret=$OIDCCLIENTSECRET")
