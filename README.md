---
layout: default
title: Home
nav_order: 1
permalink: /
---

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


## Audit Data not yet Collected
* Cloud Security Command Center (CSCC) Findings
* VM Manager Vulnerabilities

## Other Free and Open-Source Alternatives
* [OpenCSPM](https://github.com/OpenCSPM/opencspm)
* [Forseti](https://forsetisecurity.org)
* [Cloud Custodian](https://cloudcustodian.io)
