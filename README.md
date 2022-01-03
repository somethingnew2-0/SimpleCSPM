---
layout: default
title: Home
description: A simple Cloud Security Posture Management tool for Google Cloud using Google Sheets
nav_order: 1
permalink: /
---

⛅️ Simple CSPM
====
{: .no_toc }
- TOC
{:toc}

This project runs a Google App Script inside of Google Sheets to daily collect useful audit
data from several sources in Google Cloud Platform (GCP) for Cloud Security Posture Management.

Google Sheets is used for maximum customizability and minimum operational maintenance requirements
using "serverless" Google App Scripts.

<iframe style="width: 736px; height: 250px;" src="https://docs.google.com/spreadsheets/d/e/2PACX-1vTkPIAMyEEiZSFZWtxhjoQnpMv9KmG1ZVwC5I_xV7uyolz8XpjbK_VgnKIiJhGyqsBwXRYkUxAL6qt8/pubhtml?widget=true&amp;headers=false"></iframe>

The following sources in GCP are used to collect data:
* Cloud Asset Inventory
    * Search All Assets
    * Search IAM Policies
* Recommenders
* Insights
* API Keys API

I'm [Peter C (@itspeterc)](https://twitter.com/itspeterc), feel free to star this repository
and follow me on Twitter for more cloud security insights!

Shout out to [Matthew Bryant (@IAmMandatory)](https://twitter.com/IAmMandatory) and his DEF CON 29 talk on
[Hacking G Suite: The Power of Dark Apps Script Magic](https://www.youtube.com/watch?v=6AsVUS79gLw) for inspiring this project.

# Install
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

# Customize
After making your own copy of the Google Sheet, click "Extensions" -> "Apps Script" to modify
the javascript App Script code also included in this repository as [Code.gs](Code.gs).


## Audit Data not yet Collected
* Cloud Security Command Center (CSCC) Findings
* VM Manager Vulnerabilities

## Other Free and Open-Source Alternatives
* [OpenCSPM](https://github.com/OpenCSPM/opencspm)
* [Forseti](https://forsetisecurity.org)
* [Cloud Custodian](https://cloudcustodian.io)
