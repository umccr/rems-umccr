# NOTE: we specify amd64 to allow builds on Mac M1... the resulting Fargate only supports amd64
FROM amazoncorretto:18.0.2-al2

RUN yum -y install jq awscli

RUN mkdir /rems
WORKDIR /rems

ENTRYPOINT ["./docker-entrypoint.sh"]

# https://github.com/team-carepay/carepool-aws-jdbc

# For documentation see docs/installing-upgrading.md
ADD https://github.com/CSCfi/rems/releases/download/v2.27/rems.jar /rems/rems.jar

# if adding dev rems builds, copy the rems jar direct into this folder for deployment
# ADD rems.jar /rems/rems.jar

COPY docker-entrypoint.sh /rems/docker-entrypoint.sh

COPY extra-pages/ ./extra-pages/
COPY extra-translations/ ./extra-translations/

COPY config.edn /rems/config.edn
COPY theme.edn /rems/theme.edn
COPY logback.xml /rems/logback.xml

# RUN chmod 664 /usr/local/openjdk-18/lib/security/cacerts
