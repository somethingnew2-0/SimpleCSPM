---
layout: default
title: Recommenders
nav_order: 2
parent: Sheets
---

# Recommenders
<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## Unused Projects

This sheet lists the unused (or "unattended") projects by querying the [Unattended Project Recommender](https://cloud.google.com/recommender/docs/unattended-project-recommender)
from all projects in the organization. These projects can be safely deleted (because of low usage) reducing
your organization's attack surface or reassigned a new owner (because previous owners were deactivated).

Below is an [Unattended Projects Recommenders `gcloud` command](https://cloud.google.com/recommender/docs/unattended-project-recommender#gcloud)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender recommendations list --project={} --billing-project=$OPERATING_PROJECT \
    --recommender=google.resourcemanager.projectUtilization.Recommender \
    --filter="recommenderSubtype=CLEANUP_PROJECT" --location=global
```

## IAM Recommendations

This sheet lists the active IAM Recommendations by querying the [IAM Recommender](https://cloud.google.com/iam/docs/recommender-overview)
from the organization and all projects and folders in the organization. These recommendations can
be implemented to safely reduce the privilege of unused permissions based on historical usage by removing or
replacing roles. More details for IAM recommendations can also be found in the [IAM policy insights sheet](#iam-policy-insights) below.

Below are several [IAM Recommenders `gcloud` commands](https://cloud.google.com/iam/docs/recommender-managing#review-apply-gcloud)
used to generate a similar output to this sheet for each level (ie. organization, folders, projects) in
GCP resource hierarchy.
**Organization:**
```
gcloud recommender recommendations list --organization=$ORGANIZATION_ID --billing-project=$OPERATING_PROJECT \
  --recommender=google.iam.policy.Recommender \
  --filter="stateInfo.state=ACTIVE" --location=global
```
**Folders:**
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='cloudresourcemanager.googleapis.com/Folder' \
  --format="value(resource.data.name.segment(1))" | xargs -t -I {} \
    gcloud recommender recommendations list --folder={} --billing-project=$OPERATING_PROJECT \
      --recommender=google.iam.policy.Recommender \
      --filter="stateInfo.state=ACTIVE" --location=global
```
**Projects:**
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender recommendations list --project={} --billing-project=$OPERATING_PROJECT \
    --recommender=google.iam.policy.Recommender \
    --filter="stateInfo.state=ACTIVE" --location=global
```
