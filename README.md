# REMS UMCCR

A CDK pipeline for deploying REMS into the UMCCR environments.

[REMS](https://github.com/CSCfi/rems) is software that facilitates applications for controlled
datasets.

## Deployment

For this UMCCR pipeline, REMS is deployed to

- [Dev](https://rems.dev.umccr.org)
- [Prod](https://rems.umccr.org) (eventually)

New deployments are triggered on commits to Github main. Promotion to production needs to
be approved manually in the builds account.

## Maintenance

The `rems-cmd.sh` is a tool that can be used to maintain backend configuration of the REMS
instance. This means that it can trigger database migrations, set admin users, create API
keys etc.

`rems-cmd.sh` works by invoking a lambda which in turn triggers a Fargate Task to spin up
the desired admin command. _IT MUST BE INVOKED IN THE ACCOUNT OF THE DEPLOYMENT_. That is,
whereas all other build/deployment is controlled by CDK Pipelines rooted in the Build
account - the maintenance utility must be run from an AWS environment logged into the deployment
account (either Dev or Prod).

As an example here is the process to upgrade REMS.

1. Change the `application/rens-docker-image/Dockerfile` to download the new desired version.
2. Commit the change to github main.
3. After the codepipeline finishes the dev deployment - using dev credentials - execute
   ```
   ./rems-cmd.sh "migrate"
   ```
4. Confirm that the dev instance is working at `https://rems.dev.umccr.org`
5. Promote the changes to prod
6. Do the migrate command again, but this time in the prod account.
