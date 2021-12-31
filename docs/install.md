---
layout: default
title: Install
nav_order: 2
---

# Installation
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
