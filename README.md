Simple CSPM
====

This project runs a Google App Script inside of Google Sheets to daily collect useful audit
data from several sources in Google Cloud Platform (GCP) for Cloud Security Posture Management.

Google Sheets is used for maximum customizability and minimum operational maintenance requirements
using "serverless" Google App Scripts.

The following sources in GCP are used to collect data:
* Cloud Asset Inventory
    * Search All Assets
    * Search IAM Policies
* Recommenders
* Insights
* Cloud Security Command Center
    * Findings
* API Keys API

I'm [Peter C (@itspeterc)](https://twitter.com/itspeterc), feel free star this repository and follow on Twitter for more cloud security insights!

Shout out to [Matthew Bryant (@IAmMandatory)](https://twitter.com/IAmMandatory) and his DEF CON 29 talk on
[Hacking G Suite: The Power of Dark Apps Script Magic](https://www.youtube.com/watch?v=6AsVUS79gLw) for inspiring this project.

## Installation
1. Make a copy of [this Google Sheet](https://docs.google.com/spreadsheets/d/1MY9ajTdWVM_D65fHbVPGyDZL_a10Ne4_ZDSWGP3uCsA/edit?usp=sharing) by clicking "File" -> "Make a Copy"
2. Update your GCP project to run from setting on the "Main" sheet
3. Add the following GCP IAM roles for your user on your GCP project to run from
    * roles/serviceusage.serviceUsageAdmin
4. [Enable "Service Usage API"](https://console.cloud.google.com/apis/api/serviceusage.googleapis.com/overview) on your GCP Project to run from
5. Add the following GCP IAM roles for your user on your GCP organization
    * *roles/cloudasset.viewer*
    * *roles/recommender.iamViewer*
    * *roles/recommender.projectUtilViewer*
    * *roles/recommender.cloudAssetInsightsViewer*
    * *roles/recommender.firewallViewer*
    * *roles/serviceusage.apiKeysViewer*
    * *roles/securitycenter.findingsViewer*
6. Click "Run Audit"
7. Approve Google Sheets Permissions to Run
8. Click "Run Audit" Again

## Customize
After making your own copy of the Google Sheet, click "Extensions" -> "Apps Script" to modify
the javascript App Script code also included in this repository as [Code.gs](Code.gs).

## Audit Data Collected in Sheets
### Public Assets from Cloud Asset Inventory

An unfortunately common vulnerability with cloud deployments is unintentionally publicly accessible resources. The first several sheets described below use the [Cloud Asset Inventory service](https://cloud.google.com/asset-inventory/docs/overview)
to list public assets as well describe how to use [Organization Policies](https://cloud.google.com/resource-manager/docs/organization-policy/overview)
to restrict future public exposure. See the [Limiting public IPs on Google Cloud blog post and video](https://cloud.google.com/blog/topics/developers-practitioners/limiting-public-ips-google-cloud)
for an excellent summary on using organization policies to restrict public IPs for most Google Cloud resources.

#### Public GCE VMs

This sheet contains the list of running Compute Engine instances with external (aka. public)
IP addresses attached. This can be useful for enabling the
[`compute.vmExternalIpAccess` organization policy](https://cloud.google.com/compute/docs/ip-addresses/reserve-static-external-ip-address#disableexternalip) when creating an initial list of projects to be exempted from the policy.

While removing external IP addresses in favor of accessing Compute Engine instances via internal
IP addresses using [Google External Load Balancers](https://cloud.google.com/load-balancing/docs/network)
or the [Identity Aware Proxy](https://cloud.google.com/iap/docs/using-tcp-forwarding),
[VPC firewall rules](https://cloud.google.com/vpc/docs/firewalls) can also be used to limit
the destination ports, destination protocols, and source IP addresses that can access the instances
as an alternative.

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets) used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='compute.googleapis.com/Instance' \
  --filter="resource.data.networkInterfaces[].accessConfigs[].name='External NAT' AND resource.data.status='RUNNING'" \
  --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.networkInterfaces[].accessConfigs[0].natIP, resource.data.status, resource.data.creationTimestamp, resource.data.lastStartTimestamp)" > public_instances.csv
```

#### Public CloudSQL Instances

This sheet contains the list of running CloudSQL database instances with a [public ip address](https://cloud.google.com/sql/docs/mysql/configure-ip).  This can be useful for enabling the
[`sql.restrictPublicIp` organization policy](https://cloud.google.com/sql/docs/mysql/connection-org-policy#connection-constraints) when creating an initial list of projects to be exempted from the policy.

Keep in mind that CloudSQL database instances can have [authorized networks](https://cloud.google.com/sql/docs/mysql/authorize-networks)
which limit the sources from where the database with a public instance can be accessed
on the internet, although [private IP connectivity](https://cloud.google.com/sql/docs/mysql/private-ip)
should be preferred for security along with [Cloud SQL Auth proxy](https://cloud.google.com/sql/docs/mysql/connect-admin-proxy) or [IAM database authentication](https://cloud.google.com/sql/docs/mysql/authentication).

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets) used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
 ```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='sqladmin.googleapis.com/Instance' \
  --filter="resource.data.settings.activationPolicy='ALWAYS' AND resource.data.settings.ipConfiguration.ipv4Enabled='TRUE'" \
  --format="csv(resource.data.project, resource.data.name, resource.data.gceZone, resource.data.settings.ipConfiguration.ipv4Enabled, resource.data.settings.ipConfiguration.requireSsl, resource.data.serverCaCert.createTime, resource.data.settings.activationPolicy)" > public_cloudsql_instances.csv
```

#### Public Cloud Functions

This sheet contains the list of running Cloud Functions with an [HTTPS Trigger](https://cloud.google.com/functions/docs/calling/http) and
[ingress settings](https://cloud.google.com/functions/docs/networking/network-settings#ingress_settings)
allowing all traffic as opposed to restricting it to internal VPC traffic.

By default, Cloud Functions require IAM authentication and to make a function truly public it needs to
have an [unauthenticated invocation IAM binding](https://cloud.google.com/functions/docs/securing/managing-access-iam#allowing_unauthenticated_http_function_invocation) set after January 15, 2020
which this sheet does also check. The results in this sheet will overlap with the [Public IAM Policies sheet below](#public-iam-policies) for
Cloud Functions which have either `allUsers` or `allAuthentication` invocation IAM bindings. Because of this both the
[`iam.allowedPolicyMemberDomains`](https://cloud.google.com/resource-manager/docs/organization-policy/restricting-domains) (Recommended)
and the [`cloudfunctions.allowedIngressSettings`](https://cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints)
organization policies can be used to restrict Cloud Functions from being made public.

Below are two Cloud Asset Inventory `gcloud` commands [listing assets](https://cloud.google.com/asset-inventory/docs/listing-assets) and [search IAM policies](https://cloud.google.com/asset-inventory/docs/searching-iam-policies#gcloud) that when combined can be used to generate a similar output of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='cloudfunctions.googleapis.com/CloudFunction' \
  --filter="resource.data.status='ACTIVE' AND resource.data.list(show="keys"):'httpsTrigger' AND resource.data.ingressSettings='ALLOW_ALL'" \
  --format="csv(resource.data.httpsTrigger.url)" > public_cloud_functions.csv
```
```
gcloud beta asset search-all-iam-policies --scope="organizations/$ORGANIZATION_ID" --query='memberTypes:("allUsers" OR "allAuthenticatedUsers") AND policy.role.permissions:cloudfunctions.functions.invoke'
```

#### Public GKE Clusters

This sheet contains the list of running Google Kubernetes Engine (GKE) clusters with a public
endpoint enabled. Authorized Networks (essentially a firewall for the Kubernetes API) for the
public clusters are also listed as they are a [recommended hardening mechanism](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster#restrict_network_access_to_the_control_plane_and_nodes)
if the private cluster endpoint cannot be enabled exclusively. GKE clusters by default,
[allow any authenticated Google account as well as unauthenticated users access to some read-only APIs](https://cloud.google.com/kubernetes-engine/docs/how-to/role-based-access-control#default_discovery_roles)
which can leak information such as installed CustomResourceDefinitions. In order to block the public exposure of
these discovery APIs, it is [recommended to use authorized networks or a private GKE cluster](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster#restrict_access_to_cluster_api_discovery).

Alternative authentication mechanisms and legacy ABAC (Attribute-Based Access Control) are also included in the
list of public GKE clusters as [by default in newer deployments of GKE they should be disabled](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster#secure_defaults).

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets)
used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='container.googleapis.com/Cluster' \
  --filter="resource.data.privateClusterConfig.enabledPrivateEndpoint AND resource.data.status='RUNNING'" \
  --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.endpoint, resource.data.privateClusterConfig.enablePrivateEndpoint, resource.data.masterAuthorizedNetworksConfig.cidrBlocks, resource.data.status, resource.data.createTime)" > public_clusters.csv
```

#### Public App Engine

This sheet contains the serving App Engine applications that are publicly accessible by default including
all running versions of the application. Using [Serverless VPC Access](https://cloud.google.com/vpc/docs/serverless-vpc-access)
an App Engine application can be made private by configuring the ingress traffic to be only allowed from your VPC using the [Ingress Settings](https://cloud.google.com/appengine/docs/flexible/go/application-security#ingress_controls) by setting it to Internal-only.

Google's [Identity Aware Proxy](https://cloud.google.com/iap/docs/concepts-overview) can be
[enabled on App Engine applications](https://cloud.google.com/iap/docs/app-engine-quickstart) to provide a default authentication mechanism for publicly accessible apps.

Below are two  [Cloud Asset Inventory `gcloud` commands](https://cloud.google.com/asset-inventory/docs/listing-assets)
that when combined are used to generate a similar output of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='appengine.googleapis.com/Service'
```
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='appengine.googleapis.com/Application'
```

#### Public Cloud Run

This sheet contains the active Cloud Run services with [ingress settings](https://cloud.google.com/run/docs/securing/ingress#internal-services) allowing all traffic as opposed to restricting it to internal VPC traffic using [Serverless VPC Access](https://cloud.google.com/vpc/docs/serverless-vpc-access).

By default, Cloud Run services require IAM authentication and to make a service truly public it needs to
have an [unauthenticated invocation IAM binding](https://cloud.google.com/run/docs/authenticating/public)
which this sheet does also check. The results in this sheet will overlap with the [Public IAM Policies sheet below](#public-iam-policies) for
Cloud Run services which have either `allUsers` or `allAuthentication` invocation IAM bindings. Because of this both the
[`iam.allowedPolicyMemberDomains`](https://cloud.google.com/resource-manager/docs/organization-policy/restricting-domains) (Recommended)
and the [`run.allowedIngress`](https://cloud.google.com/resource-manager/docs/organization-policy/org-policy-constraints)
organization policies can be used to restrict Cloud Run services from being made public.

Below are two Cloud Asset Inventory `gcloud` commands [listing assets](https://cloud.google.com/asset-inventory/docs/listing-assets) and [search IAM policies](https://cloud.google.com/asset-inventory/docs/searching-iam-policies#gcloud) that when combined can be used to generate a similar output of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='run.googleapis.com/Service'
```
```
gcloud beta asset search-all-iam-policies --scope="organizations/$ORGANIZATION_ID" --query='memberTypes:("allUsers" OR "allAuthenticatedUsers") AND policy.role.permissions:run.routes.invoke'
```

#### External Load Balancers from Cloud Asset Inventory

The sheets below list the several components of external Google Cloud Load Balancers (GCLBs or GLBs) that
can be queried from the Cloud Asset inventory service using [Cloud Asset Inventory `gcloud` commands](https://cloud.google.com/asset-inventory/docs/listing-assets).

GCLBs require two components: a frontend "forwarding rule" and a backend service. The external frontend "forwarding rules" can be restricted using the [`compute.restrictProtocolForwardingCreationForTypes` organization policy](https://cloud.google.com/load-balancing/docs/protocol-forwarding#enforcing_protocol_forwarding_settings_across_a_project_folder_or_organization). The external backend services can be restricted using the [`compute.restrictLoadBalancerCreationForTypes` organization policy](https://cloud.google.com/load-balancing/docs/org-policy-constraints).

##### External Global Forwarding Rules

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets)
used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='compute.googleapis.com/GlobalForwardingRule' \
  --filter="resource.data.loadBalancingScheme='EXTERNAL'" \
  --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.IPAddress, resource.data.portRange, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_global_forwarding_rule.csv
```

##### External Forwarding Rules

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets)
used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='compute.googleapis.com/ForwardingRule' \
  --filter="resource.data.loadBalancingScheme='EXTERNAL'" \
  --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.IPAddress, resource.data.portRange, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_forwarding_rule.csv
```

##### External Backend Services

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets)
used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='compute.googleapis.com/BackendService' \
  --filter="resource.data.loadBalancingScheme='EXTERNAL'" \
  --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.protocol, resource.data.port, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_backend_service.csv
```

##### External Regional Backend Services

Below is an equivalent [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets)
used to generate a CSV of this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset list --organization=$ORGANIZATION_ID --content-type='resource' \
  --asset-types='compute.googleapis.com/RegionBackendService' \
  --filter="resource.data.loadBalancingScheme='EXTERNAL'" \
  --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.protocol, resource.data.port, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_regional_backend_service.csv
```

### Public IAM Policies

This sheet contains the list of resources with IAM policies attached containing the
[`allUsers`](https://cloud.google.com/iam/docs/overview#all-users)
or [`allAuthenticatedUsers`](https://cloud.google.com/iam/docs/overview#all-authenticated-users)
effectively making that resource publicly accessible. Storage buckets, Cloud Functions, Cloud Run services
are several of the resources that can be made public through use of these IAM principles.

The [`iam.allowedPolicyMemberDomains`](https://cloud.google.com/resource-manager/docs/organization-policy/restricting-domains)
organization policy can be used to restrict usage of the `allUsers` and `allAuthenticatedUsers` principles
and consequently restrict resources from being made publicly accessible.

Below is a [Cloud Asset Inventory `gcloud` command](https://cloud.google.com/asset-inventory/docs/listing-assets)
used to generate a similar output to this sheet for your organization by specifying an `$ORGANIZATION_ID`.
```
gcloud beta asset search-all-iam-policies --scope="organizations/$ORGANIZATION_ID" \
  --query='memberTypes:("allUsers" OR "allAuthenticatedUsers")'
```

### Recommenders

#### Unused Projects

This sheet lists the unused (or "unattended") projects by querying the [Unattended Project Recommender](https://cloud.google.com/recommender/docs/unattended-project-recommender)
from all projects in the organization. These projects can be safely deleted (because of low usage) reducing
your organization's attack surface or reassigned a new owner (because previous owners were deactivated).

Below is an [unattended projects recommenders `gcloud` command](https://cloud.google.com/recommender/docs/unattended-project-recommender#gcloud)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender recommendations list --project={} --billing-project=$OPERATING_PROJECT \
    --recommender=google.resourcemanager.projectUtilization.Recommender \
    --filter="recommenderSubtype=CLEANUP_PROJECT" --location=global
```

#### IAM Recommendations

This sheet lists the active IAM recommendations by querying the [IAM Recommender](https://cloud.google.com/iam/docs/recommender-overview)
from the organization and all projects and folders in the organization. These recommendations can
be implemented to safely reduce the privilege of unused permissions based on historical usage by removing or
replacing roles. More details for IAM recommendations can also be found in the [IAM policy insights sheet](#iam-policy-insights) below.

Below are several [IAM recommenders `gcloud` commands](https://cloud.google.com/iam/docs/recommender-managing#review-apply-gcloud)
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

### Insights

#### IAM Policy Insights

This sheet lists the active IAM policy insights by querying the [IAM policy insights](https://cloud.google.com/iam/docs/manage-policy-insights)
from the organization and all projects and folders in the organization.
These insights are more detailed than the [IAM recommendations](#iam-recommendations) found above.

Below are several [IAM policy insight `gcloud` commands](https://cloud.google.com/iam/docs/manage-policy-insights#list-policy-insights)
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

#### Lateral Movement Insights

This sheet lists the active [Lateral Movement Insights](https://cloud.google.com/iam/docs/manage-lateral-movement-insights)
from all projects in the organization. These insights are useful for finding chains of `actAs` permissions
allowing for cross-project impersonation of service accounts. For more details on exploiting lateral movement in
GCP, see [Allison Donovan (@matter_of_cat)](https://twitter.com/matter_of_cat) and [Dylan Ayrey (@InsecureNature)](https://twitter.com/InsecureNature)'s Blackhat talk [Lateral Movement & Privilege Escalation in GCP; Compromise Organizations without Dropping an Implant](https://www.youtube.com/watch?v=kyqeBGNSEIc).

The [`iam.disableCrossProjectServiceAccountUsage` orgnaization policy](https://cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts#disable_cross_project_service_accounts)
can be used to restrict lateral movement by restricting cross project service account IAM bindings.

Below is an [lateral movement insight `gcloud` command](https://cloud.google.com/iam/docs/manage-lateral-movement-insights#list-lateral-movement-insights)
used to generate a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.iam.policy.LateralMovementInsight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

#### Service Account Insights
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.iam.serviceAccount.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

#### Asset Insights
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.cloudasset.asset.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```

#### Firewall Insights
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud recommender insights list --project={} --billing-project=$OPERATING_PROJECT \
    --insight-type=google.compute.firewall.Insight \
    --filter="stateInfo.state=ACTIVE" --location=global
```


### API Keys
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud alpha services api-keys list --project={} --billing-project=$OPERATING_PROJECT \
    --format="csv(name.segement(1), displayName, uid, createTime)"
```

## Audit Data not yet Collected
* Cloud Security Command Center (CSCC) Findings
* VM Manager Vulnerabilities

## Other Free and Open-Source Alternatives
* [OpenCSPM](https://github.com/OpenCSPM/opencspm)
* [Forseti](https://forsetisecurity.org)
* [Cloud Custodian](https://cloudcustodian.io)
