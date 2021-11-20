gcp-cspm-sheets
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

I'm [Peter C (@itspeterc)](https://twitter.com/itspeterc), feel free star this repository and follow on Twitter for more cloud security insights!

Shout out to [Matthew Bryant (@IAmMandatory)](https://twitter.com/IAmMandatory) and his DEF CON 29 talk on
[Hacking G Suite: The Power of Dark Apps Script Magic](https://www.youtube.com/watch?v=6AsVUS79gLw) for inspiring this project.

## Installation
1. Make a copy of this Google Sheet by clicking "File" -> "Make a Copy"
2. Update your GCP project to run from
3. Add the following GCP IAM roles for your user on your GCP project to run from
    * roles/serviceusage.serviceUsageAdmin
4. [Enable "Service Usage API"](https://console.cloud.google.com/apis/api/serviceusage.googleapis.com/overview) on your GCP Project to run from
5. Add the following GCP IAM roles for your user on your GCP organization
    * roles/resourcemanager.organizationViewer
    * roles/resourcemanager.folderViewer
    * roles/cloudasset.viewer
    * roles/recommender.iamViewer
    * roles/recommender.projectUtilViewer
    * roles/recommender.cloudAssetInsightsViewer
    * roles/recommender.firewallViewer
6. Click "Run Audit"
7. Approve Google Sheets Permissions to Run
8. Click "Run Audit" Again

## Customize
After making your own copy of the Google Sheet, click "Tools" -> "Script editor" to modify
the javascript App Script code also included in this repository as [Code.gs](Code.gs).

## Audit Data Collected
* Public Assets from Cloud Asset Inventory
    * Public GCE VMs
    * Public CloudSQL Instances
    * Public Cloud Functions
    * Public App Engine
    * Public Cloud Run
* External Load Balancers from Cloud Asset Inventory
    * External Global Forwarding Rules
    * External Forwarding Rules
    * External Backend Services
    * External Regioanl Backend Services
* Public IAM Policies with "allUsers" or "allAuthenticatedUsers"
* Recommenders
    * Unused Projects
    * IAM Recommendations
* Insights
    * Lateral Movement Insights
    * IAM Policy Insights
    * Service Account Insights
    * Asset Insights
    * Firewall Insights


## Audit Data not yet Collected
* API Keys
* Cloud Security Command Center (CSCC) Findings
* VM Manager Vulnerabilities
* Public GKE clusters

## Other Free and Open-Source Alternatives
* [OpenCSPM](https://github.com/OpenCSPM/opencspm)
* [Forseti](https://forsetisecurity.org)
* [Cloud Custodian](https://cloudcustodian.io)
