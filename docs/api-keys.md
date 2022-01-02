---
layout: default
title: API Keys
nav_order: 5
permalink: /api-keys
---

# API Keys

This sheet lists all of the [API keys](https://cloud.google.com/docs/authentication/api-keys) from all projects in the organization along with
the restrictions placed on those API keys. API Keys are an alternative mechanism to authenticate to Google Cloud APIs as opposed to
Service Account and User credentials. They are not recommended with the exception of certain Google Developer APIs such as the
[Google Maps API and SDK](https://developers.google.com/maps/api-security-best-practices). If API Keys are necessary it highly recommend
they are restricted with which [client application they can be used from](https://cloud.google.com/docs/authentication/api-keys#adding_application_restrictions)
and which [APIs are authorized to be used with the key](https://cloud.google.com/docs/authentication/api-keys#adding_api_restrictions).

This sheet was inspired by ScaleSec's blog post on [Inventory Your GCP API Keys](https://scalesec.com/blog/inventory-your-gcp-api-keys/) and associated [Python inventory script](https://github.com/ScaleSec/gcp_api_key_inventory/blob/main/apiInventory.py) by [Jason Dyke (@jasonadyke)](https://twitter.com/jasonadyke).

Below is a [API Key list `gcloud` command](https://cloud.google.com/sdk/gcloud/reference/alpha/services/api-keys/list) used to generate
a similar output to this sheet.
```
gcloud projects list --format="value(projectId)" | xargs -t -I {} \
  gcloud alpha services api-keys list --project={} --billing-project=$OPERATING_PROJECT \
    --format="csv(name.segement(1), displayName, uid, createTime)"
```
