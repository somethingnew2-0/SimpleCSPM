---
layout: default
title: Insights
nav_order: 4
permalink: /insights
---

# Insights
{: .no_toc }
<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
- TOC
{:toc}
</details>

## IAM Policy Insights

This sheet lists the active IAM Policy Insights by querying the [IAM Policy Insights](https://cloud.google.com/iam/docs/manage-policy-insights)
from the organization and all projects and folders in the organization.
These insights are more detailed than the [IAM recommendations](recommenders/#iam-recommendations).

Below are several [IAM Policy Insight `gcloud` commands](https://cloud.google.com/iam/docs/manage-policy-insights#list-policy-insights)
used to generate a similar output to this sheet for each level (ie. organization, folders, projects) in
GCP resource hierarchy.

**Organization:**
```
gcloud recommender insights list --organization=$ORGANIZATION_ID --billing-project=$OPERATING_PROJECT \
  --insight-type=google.iam.policy.Insight \
  --filter="stateInfo.state=ACTIVE" --location=global
```
**Folders:**
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='cloudresourcemanager.googleapis.com/Folder' \
  --format="value(resource.data.name.segment(1))" | xargs -t -I {} \
    gcloud recommender insights list --folder={} --billing-project=$OPERATING_PROJECT \
      --insight-type=google.iam.policy.Insight \
      --filter="stateInfo.state=ACTIVE" --location=global
```
**Projects:**
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.iam.policy.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

## Asset Insights

This sheet lists the active [Asset Insights](https://cloud.google.com/asset-inventory/docs/using-asset-insights)
from all projects in the organization. There are several
[insight subtypes](https://cloud.google.com/asset-inventory/docs/using-asset-insights#insight_subtypes) with this
insight, please take a look at their descriptions as they provide incredibly useful information on IAM members external
to your organizations (eg. an @gmail.com user address with `EXTERNAL_MEMBER`) with access to your resources, as well as
IAM policies with deactivated users (ie. `TERMINATED_MEMBER`), or the `allUsers` and `allAuthenticatedUsers` principles.

The [`iam.allowedPolicyMemberDomains` organization policy](https://cloud.google.com/resource-manager/docs/organization-policy/restricting-domains)
can be used to reduce many of these insight subtypes by restricting IAM policies with members external to the organization including
the `allUsers` and `allAuthenticatedUsers` principles (ie. `PUBLIC_IAM_POLICY`).

Along with this organization policy it is highly recommended to enable [limiting third-party OAuth app access to your Google Cloud APIs](https://support.google.com/a/answer/7281227)
through the Google Workspace Admin console for your organization to prevent third-party OAuth apps from using your Google Cloud
administrator privileges unrestricted.

Below is an [Asset Insight `gcloud` command](https://cloud.google.com/asset-inventory/docs/using-asset-insights#requesting_project_insights)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.cloudasset.asset.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

## Lateral Movement Insights

This sheet lists the active [Lateral Movement Insights](https://cloud.google.com/iam/docs/manage-lateral-movement-insights)
from all projects in the organization. These insights are useful for finding chains of `actAs` permissions
allowing for cross-project impersonation of service accounts. For more details on exploiting lateral movement in
GCP, see [Allison Donovan (@matter_of_cat)](https://twitter.com/matter_of_cat) and [Dylan Ayrey (@InsecureNature)](https://twitter.com/InsecureNature)'s Blackhat talk [Lateral Movement & Privilege Escalation in GCP; Compromise Organizations without Dropping an Implant](https://www.youtube.com/watch?v=kyqeBGNSEIc).

The [`iam.disableCrossProjectServiceAccountUsage` orgnaization policy](https://cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts#disable_cross_project_service_accounts)
can be used to restrict lateral movement by restricting cross project service account IAM bindings.

Below is an [Lateral Movement Insight `gcloud` command](https://cloud.google.com/iam/docs/manage-lateral-movement-insights#list-lateral-movement-insights)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.iam.policy.LateralMovementInsight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

## Service Account Insights

This sheet lists the active [Service Account Insights](https://cloud.google.com/iam/docs/manage-service-account-insights)
from all projects in the organization. These insights are useful for finding service accounts to safely disable or
delete based on historical usage.

Below is an [Service Account Insight `gcloud` command](https://cloud.google.com/iam/docs/manage-service-account-insights#list-service-account-insights)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.iam.serviceAccount.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

## Firewall Insights

This sheet lists the active [Firewall Insights](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/concepts/overview)
when enabled from all projects in the organization. Firewall Insights are not enabled by default as they have a
[unique pricing](https://cloud.google.com/network-intelligence-center/pricing#firewall-insights-pricing-details) and are not free.
Follow the [prerequisites for enabling Firewall Insights](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights#before-you-begin),
by [enabling the Firewall Insights API](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights#enabling-api),
[Firewall Rule Logging on individual firewall rules](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights#enabling-fw-rules-logging),
[enabling the chosen insight type](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights#enabling-insights),
and [configuring an observation period](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights#observation-period).
These insights are useful for removing redundant firewall rules (ie. [shadowed rules](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/concepts/overview#shadowed-firewall-rules)),
removing unused firewall rules (ie. [allow rules with no hits](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/concepts/overview#no-hits)),
and reducing the protocols and ports of firewall rules based on historical usage (eg. rules with [unused attributes](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/concepts/overview#unused-attributes)
and [overly permissive IP address or port ranges](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/concepts/overview#ranges)).

Below is an [Firewall Insight `gcloud` command](https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights#working_with_insights_using_gcloud_commands_or_the_api)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.compute.firewall.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```
