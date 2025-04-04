var organizationID = "";
var operatingProjectID = "";
var allProjectIDs = [];
var allProjectNumbersToProject = {};
var allFolderNumbers = [];
var allFolderNumbersToFolder = {};
var spreadsheet;

function runAudit() {
  spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  sendGAMP('runAudit');

  const auditFunctionsToTrigger = [
    'auditAllUsersIAMPolicies',
    'auditPublicCloudAssetInventory',
    'auditServiceAccounts',
    'auditServiceAccountKeyUsage',
    'auditGKEClusters',
    'auditUnattendedProjects',
    'auditIAMRecommendations',
    'auditPolicyInsights',
    'auditAssetInsights',
    'auditLateralMovementInsights',
    'auditServiceAccountInsights',
    'auditFirewallInsights',
    'auditAPIKeys',
    'auditBigQueryUserScheduledQueries',
    'auditAllGCEVMs',
    'auditAllCloudSQLInstances'
  ];

  ScriptApp.getUserTriggers(spreadsheet).forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  auditFunctionsToTrigger.forEach((functionName, index) => {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyDays(1)
      .atHour(index)
      .create();
  });

  Logger.log("Configured Triggers");

  initializeGlobals();

  auditAllUsersIAMPolicies();

  auditPublicCloudAssetInventory();

  auditServiceAccounts();
  auditServiceAccountKeyUsage();

  auditGKEClusters();
  auditCloudFunctions();

  auditUnattendedProjects();
  auditIAMRecommendations();

  auditPolicyInsights();
  auditAssetInsights();
  auditLateralMovementInsights();
  auditServiceAccountInsights();
  auditFirewallInsights();

  auditAPIKeys();

  auditBigQueryUserScheduledQueries();

  auditAllCloudSQLInstances();
  auditAllGCEVMs();
}

// Collect Google Analytics
// Based on https://gist.github.com/mhawksey/9199459
function sendGAMP(action) {
  var userProperties = PropertiesService.getUserProperties();
  var uuid = userProperties.getProperty('USER_UUID');
  if (uuid == null) {
    uuid = Utilities.getUuid()
    userProperties.setProperty('USER_UUID', uuid);
  }
  var data = {
    'v': '1',
    'tid': "UA-210888102-1",
    'cid': uuid,
    'z': Math.floor(Math.random() * 10E7),
    't': 'event',
    'ds': 'Apps Script',
    'ec': 'execution',
    'ea': action,

  };
  var payload = Object.keys(data).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
  }).join('&');
  var options = {
    'method': 'POST',
    'payload': payload
  };

  Logger.log('https://www.google-analytics.com/collect ' + JSON.stringify(options));
  UrlFetchApp.fetch('https://www.google-analytics.com/collect', options);
}

function initializeGlobals() {
  spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  var projectIDRange = spreadsheet.getRangeByName("ProjectID");
  if (projectIDRange == null) {
    throw new Error("Could not find Named range 'ProjectID' sheet to read project id with Asset API enabled");
  }
  operatingProjectID = projectIDRange.getValue();

  enableServices(['serviceusage.googleapis.com',
    'apikeys.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    'cloudasset.googleapis.com',
    'recommender.googleapis.com']);

  organizationID = fetchOrganizationID();

  if (allFolderNumbers.length == 0) {
    fetchAllFolders((folders) => {
      allFolderNumbers = allFolderNumbers.concat(folders.map((folder) => folder.name.split("/")[1]));
      folders.forEach((folder) => allFolderNumbersToFolder[folder.name.split("/")[1]] = folder);
      // Logger.log(JSON.stringify(folders))
    });
  }

  if (allProjectIDs.length == 0) {
    // Fetch all projects in the organization except App Script projects starting with "sys-"
    fetchAllProjects((projects) => {
      allProjectIDs = allProjectIDs.concat(projects.map((project) => project.projectId).filter((projectID) => !projectID.startsWith("sys-")));
      projects.forEach((project) => allProjectNumbersToProject[project.projectNumber] = project);
    });
    // Logger.log(allProjectIDs.length);
  }
}

// These operations should be fairly quick as they query the organization
// directly instead of iterating over each project individually
// Batch run all of these Cloud Asset Inventory audit method together
function auditPublicCloudAssetInventory() {
  sendGAMP('auditPublicCloudAssetInventory');

  initializeGlobals();

  // Collect public resources from Cloud Asset Inventory
  auditPublicGCEVMs();
  auditPublicCloudSQLInstances();
  auditPublicCloudFunctions();
  auditPublicGKEClusters();
  auditPublicAppEngine();
  auditPublicCloudRun();
  auditExternalGlobalForwardingRules();
  auditExternalForwardingRules();
  auditExternalBackendServices();
  auditExternalRegionalBackendServices();
}

function fetchOrganizationID() {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    },
    'muteHttpExceptions': true,
  };

  // https://stackoverflow.com/questions/59749855/how-do-i-get-the-organization-id-of-my-current-project-in-google-cloud-platform
  // https://cloud.google.com/resource-manager/reference/rest/v1/projects/getAncestry
  Logger.log('https://cloudresourcemanager.googleapis.com/v1/projects/' + operatingProjectID + ':getAncestry');
  var response = UrlFetchApp.fetch('https://cloudresourcemanager.googleapis.com/v1/projects/' + operatingProjectID + ':getAncestry', { ...options, });
  var ancestors = JSON.parse(response.getContentText());
  var organizationAncestor = ancestors.ancestor.find((ancestor) => ancestor.resourceId.type == "organization");
  if (organizationAncestor == null) {
    throw new Error("Could not find organization associated with project " + operatingProjectID);
  }
  return organizationAncestor.resourceId.id;
}

function enableServices(services) {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    },
  };

  payload = { 'payload': JSON.stringify({ 'serviceIds': services }) };

  // https://cloud.google.com/service-usage/docs/reference/rest/v1/services/batchEnable
  // https://cloud.google.com/service-usage/docs/enable-disable#enabling
  var response;
  try {
    Logger.log('https://serviceusage.googleapis.com/v1/projects/' + operatingProjectID + '/services:batchEnable');
    response = UrlFetchApp.fetch('https://serviceusage.googleapis.com/v1/projects/' + operatingProjectID + '/services:batchEnable', { ...options, ...payload });
  } catch (error) {
    // Ignore the error and try continuing on if the Service Usage API is not yet enabled
    // as it needs to be done manually in the Cloud Console UI
    if (error.message.includes('Service Usage API has not been used in project')) {
      return;
    }
    // Try enabling services on the the project number given in the error message
    var match = error.message.match(/has not been used in project (?<projectNumber>\d+) before or it is disabled/);
    if (match != null) {
      Logger.log('https://serviceusage.googleapis.com/v1/projects/' + match.groups.projectNumber + '/services:batchEnable')
      response = UrlFetchApp.fetch('https://serviceusage.googleapis.com/v1/projects/' + match.groups.projectNumber + '/services:batchEnable', { ...options, ...payload });
    }
  }
  if (response == null) {
    return;
  }
  var jsonResponse = JSON.parse(response.getContentText());
  var operationName = jsonResponse.name;
  var done = false;
  while (!done) {
    response = UrlFetchApp.fetch('https://serviceusage.googleapis.com/v1/' + operationName, options);
    jsonResponse = JSON.parse(response.getContentText());
    done = jsonResponse.done;
  }
}

function createSheet(title, columns) {
  var sheet = spreadsheet.getSheetByName(title);
  if (sheet == null) {
    sheet = spreadsheet.insertSheet(title);
  }

  spreadsheet.setActiveSheet(sheet);
  sheet.clear();
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, columns.length, 200);
  var firstRow = sheet.getRange(1, 1, 1, columns.length);
  firstRow.setValues([columns]);
  firstRow.setFontWeight("bold");
  sheet.setActiveRange(firstRow.offset(1, 0));
  SpreadsheetApp.flush();

  return sheet;
}

function deepFind(obj, path, empty = undefined) {
  var paths = path.split('.')
    , current = obj
    , i;

  for (i = 0; i < paths.length; ++i) {
    if (current[paths[i]] == undefined) {
      return empty;
    } else {
      current = current[paths[i]];
    }
  }
  return current;
}

// https://cloud.google.com/asset-inventory/docs/searching-iam-policies
function fetchIAMPolicies(query, callback) {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };
  var nextPageToken = "";
  while (nextPageToken != null) {
    // https://cloud.google.com/asset-inventory/docs/reference/rest/v1/TopLevel/searchAllIamPolicies
    Logger.log('https://cloudasset.googleapis.com/v1/organizations/' + organizationID + ':searchAllIamPolicies?query=' + encodeURIComponent(query) + '&pageSize=1000&pageToken=' + nextPageToken);
    var response = UrlFetchApp.fetch('https://cloudasset.googleapis.com/v1/organizations/' + organizationID + ':searchAllIamPolicies?query=' + encodeURIComponent(query) + '&pageSize=1000&pageToken=' + nextPageToken, options);
    var jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse.results != null) {
      callback(jsonResponse.results);
      nextPageToken = jsonResponse.nextPageToken;
    } else {
      return;
    }
  }
}

// gcloud beta asset search-all-iam-policies   --scope='organizations/12345678910' --query='memberTypes:("allUsers" OR "allAuthenticatedUsers")'
// https://cloud.google.com/asset-inventory/docs/searching-iam-policies-samples#use_case_list_resources_that_have_roles_granted_to_the_public
function auditAllUsersIAMPolicies() {
  sendGAMP('auditAllUsersIAMPolicies');

  initializeGlobals();

  var sheet = createSheet("Public IAM Policies", ["Project", "Asset Type", "Resource", "Policy"])

  fetchIAMPolicies('memberTypes:("allUsers" OR "allAuthenticatedUsers")', (results) => {
    results.forEach((result) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([[allProjectNumbersToProject[result.project.split("/")[1]].projectId, result.assetType, result.resource, JSON.stringify(result.policy)]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });
}

function fetchAllAssets(assetTypes, callback) {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };
  var nextPageToken = "";
  while (nextPageToken != null) {
    // https://cloud.google.com/asset-inventory/docs/reference/rest/v1/assets/list
    var response = UrlFetchApp.fetch('https://cloudasset.googleapis.com/v1/organizations/' + organizationID + '/assets?assetTypes=' + assetTypes + '&contentType=resource' + '&pageSize=1000&pageToken=' + nextPageToken, options);
    var jsonResponse = JSON.parse(response.getContentText());
    callback(jsonResponse.assets);
    nextPageToken = jsonResponse.nextPageToken;
  }
}

function queryMetrics(projectID, query, callback) {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };

  var nextPageToken = "";
  while (nextPageToken != null) {
    // https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.timeSeries/query
    options['payload'] = JSON.stringify({
      "query": query,
      "pageSize": 1000,
      "pageToken": nextPageToken
    })
    var response = UrlFetchApp.fetch('https://monitoring.googleapis.com/v3/projects/' + projectID + '/timeSeries:query', options);
    var jsonResponse = JSON.parse(response.getContentText());
    callback(jsonResponse);
    nextPageToken = jsonResponse.nextPageToken;
  }
}

function fetchAllProjects(callback) {
  var assetTypes = "cloudresourcemanager.googleapis.com/Project";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    callback(assets.map((asset) => asset.resource.data));
  });
}

function fetchAllFolders(callback) {
  var assetTypes = "cloudresourcemanager.googleapis.com/Folder";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    callback(assets.map((asset) => asset.resource.data));
  });
}

function auditServiceAccounts() {
  initializeGlobals();

  sendGAMP('auditSerivceAccounts');

  var sheet = createSheet("All Service Accounts", ["Project", "Email", "Description",  "Status"]);

  // https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts
  var assetTypes = "iam.googleapis.com/ServiceAccount";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([[data.projectId, data.email, data.description, data.disabled ? "DISABLED" : "ACTIVE"]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
      
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

function auditServiceAccountKeyUsage() {
  initializeGlobals();

  sendGAMP('auditServiceAccountKeyUsage');

  var sheet = createSheet("Service Account Key Usage", ["Project", "Service Account", "Key ID", "Key Algorithm", "Valid After", "Valid Before", "Last Used"]);

  // https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts.keys
  var assetTypes = "iam.googleapis.com/ServiceAccountKey";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      const data = asset.resource.data;
      if (Date.parse(data.validBeforeTime) > Date.now() && data.keyType == "USER_MANAGED") {
        const activeRange = sheet.getActiveRange();
        const projectID = asset.name.split("/")[4];
        const keyID = data.name.split("/")[5];

        queryMetrics(projectID, "fetch iam_service_account | metric 'iam.googleapis.com/service_account/key/authn_events_count' | filter (resource.unique_id == '"+asset.name.split("/")[6]+"') | within -30d | align rate()", (response) => {
          if (response.timeSeriesData != null) {
            const formattedData = response.timeSeriesData.map((data) => {
              return {
                keyID: data.labelValues[2].stringValue,
                positiveValues: data.pointData.some((point) => point.values.some(( value) => value.doubleValue > 0)),
                lastUsed: new Date(Math.max(...data.pointData.map((point) => new Date(point.timeInterval.endTime))))
              };
            }).filter((data) => data.positiveValues);

            var keyIDToLastUsed = {};
            for (const data of formattedData) {
              const key = data["keyID"];
              if (!(key in keyIDToLastUsed)) {
                keyIDToLastUsed[key] = data["lastUsed"];
              } else {
                if (keyIDToLastUsed[key] < data["lastUsed"]) {
                  keyIDToLastUsed[key] = data["lastUsed"];
                }
              }
            }

            activeRange.setValues([[projectID, "=HYPERLINK(\"https://console.cloud.google.com/iam-admin/serviceaccounts/details/"+data.name.split("/")[3]+"/keys?project="+projectID+"\", \""+data.name.split("/")[3]+"\")", keyID, data.keyAlgorithm, data.validAfterTime, data.validBeforeTime, keyID in keyIDToLastUsed ? keyIDToLastUsed[keyID].toISOString() : ""]]);
          } else {
            activeRange.setValues([[projectID, "=HYPERLINK(\"https://console.cloud.google.com/iam-admin/serviceaccounts/details/"+data.name.split("/")[3]+"/keys?project="+projectID+"\", \""+data.name.split("/")[3]+"\")", keyID, data.keyAlgorithm, data.validAfterTime, data.validBeforeTime, ""]]);
          }
          sheet.setActiveRange(activeRange.offset(1, 0));
        });
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// gcloud beta asset list --organization=1234567891011 --asset-types='compute.googleapis.com/Instance' --content-type='resource' --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.networkInterfaces[].accessConfigs[0].natIP, resource.data.status, resource.data.creationTimestamp, resource.data.lastStartTimestamp)" --filter="resource.data.networkInterfaces[].accessConfigs[].type='ONE_TO_ONE_NAT' AND resource.data.status='RUNNING'" > public_instances.csv
function auditPublicGCEVMs() {
  sendGAMP('auditPublicGCEVMs');

  var sheet = createSheet("Public GCE VMs", ["Project", "Name", "Machine Type", "NAT IP", "Status", "Creation Time", "Last Start Time"]);

  // https://cloud.google.com/compute/docs/reference/rest/v1/instances
  var assetTypes = "compute.googleapis.com/Instance";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      if (deepFind(asset, "resource.data.networkInterfaces", []).some((ni) => deepFind(ni, "accessConfigs", []).some((ac) => ac.type == 'ONE_TO_ONE_NAT')) && deepFind(asset, "resource.data.status", '') == 'RUNNING') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], data.name, data.machineType.split("/").pop(), data.networkInterfaces[0].accessConfigs[0].natIP, data.status, data.creationTimestamp, data.lastStartTimestamp]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// gcloud beta asset list --organization=1234567891011 --asset-types='sqladmin.googleapis.com/Instance' --content-type='resource' --format="csv(resource.data.project, resource.data.name, resource.data.gceZone, resource.data.settings.ipConfiguration.ipv4Enabled, resource.data.settings.ipConfiguration.requireSsl, resource.data.serverCaCert.createTime, resource.data.settings.activationPolicy)" --filter="resource.data.settings.activationPolicy='ALWAYS' AND resource.data.settings.ipConfiguration.ipv4Enabled='TRUE'" > public_cloudsql_instances.csv
function auditPublicCloudSQLInstances() {
  sendGAMP('auditPublicCloudSQLInstances');

  var sheet = createSheet("Public CloudSQL Instances", ["Project", "Name", "Version", "GCE Zone", "Public IP Enabled", "Require SSL", "Authorized Networks", "Create Time", "Activation Policy"]);

  // https://cloud.google.com/sql/docs/mysql/admin-api/rest/v1beta4/instances
  var assetTypes = "sqladmin.googleapis.com/Instance";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      var ipConfig = data.settings.ipConfiguration;
      if (data.settings.activationPolicy == 'ALWAYS' && ipConfig.ipv4Enabled) {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[data.project, data.name, data.databaseVersion, data.gceZone, ipConfig.ipv4Enabled, ipConfig.requireSsl, ipConfig.hasOwnProperty('authorizedNetworks') ? ipConfig.authorizedNetworks.map((acl) => acl.value).join(",") : "", data.createTime, data.settings.activationPolicy]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// Checks for unauthenticated invocations which are allowed by setting allUsers in the service
// IAM policy after January 15, 2020
// https://cloud.google.com/functions/docs/securing/managing-access-iam#allowing_unauthenticated_http_function_invocation
// gcloud beta asset list --organization=1234567891011 --asset-types='cloudfunctions.googleapis.com/CloudFunction' --content-type='resource' --filter="resource.data.status='ACTIVE' AND  resource.data.list(show="keys"):'httpsTrigger' AND resource.data.ingressSettings='ALLOW_ALL'" --format="csv(resource.data.httpsTrigger.url)"
// gcloud beta asset search-all-iam-policies   --scope='organizations/12345678910' --query='memberTypes:("allUsers" OR "allAuthenticatedUsers") AND policy.role.permissions:cloudfunctions.functions.invoke'
function auditPublicCloudFunctions() {
  sendGAMP('auditPublicCloudFunctions');

  var sheet = createSheet("Public Cloud Functions", ["Project", "Name", "Runtime", "Ingress Setting", "Security Level", "Status", "Update Time", "Url"]);

  var unauthenticatedFunctions = new Set();
  fetchIAMPolicies('memberTypes:("allUsers" OR "allAuthenticatedUsers") AND policy.role.permissions:cloudfunctions.functions.invoke', (results) => {
    results.forEach((result) => {
      unauthenticatedFunctions.add(result.resource);
    });
  });

  // https://cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions
  var assetTypes = "cloudfunctions.googleapis.com/CloudFunction";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      if (data.status == 'ACTIVE' && data.hasOwnProperty('httpsTrigger') && data.ingressSettings == "ALLOW_ALL" && (new Date(data.updateTime) < new Date('2020-01-15') || unauthenticatedFunctions.has(asset.name))) {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.name.split("/")[8], data.runtime, data.ingressSettings, data.httpsTrigger.securityLevel, data.status, data.updateTime, data.httpsTrigger.url]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// Checks for unauthenticated invocations which are allowed by setting allUsers in the service
// IAM policy after January 15, 2020
// https://cloud.google.com/functions/docs/securing/managing-access-iam#allowing_unauthenticated_http_function_invocation
// gcloud beta asset list --organization=1234567891011 --asset-types='cloudfunctions.googleapis.com/CloudFunction' --content-type='resource' --filter="resource.data.status='ACTIVE' AND  resource.data.list(show="keys"):'httpsTrigger' AND resource.data.ingressSettings='ALLOW_ALL'" --format="csv(resource.data.httpsTrigger.url)"
// gcloud beta asset search-all-iam-policies   --scope='organizations/12345678910' --query='memberTypes:("allUsers" OR "allAuthenticatedUsers") AND policy.role.permissions:cloudfunctions.functions.invoke'
function auditCloudFunctions() {
  sendGAMP('auditCloudFunctions');

  var sheet = createSheet("All Cloud Functions", ["Project", "Name", "Runtime", "Status", "Update Time"]);

  // https://cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions
  var assetTypes = "cloudfunctions.googleapis.com/CloudFunction";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      if (data.status == 'ACTIVE') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.name.split("/")[8], data.runtime, data.status, data.updateTime]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// gcloud beta asset list --organization=1234567891011 --asset-types='container.googleapis.com/Cluster' --content-type='resource' --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.endpoint, resource.data.privateClusterConfig.enablePrivateEndpoint, resource.data.masterAuthorizedNetworksConfig.cidrBlocks, resource.data.status, resource.data.createTime)" --filter="resource.data.privateClusterConfig.enabledPrivateEndpoint AND resource.data.status='RUNNING'" > public_clusters.csv
function auditPublicGKEClusters() {
  sendGAMP('auditPublicGKEClusters');

  var sheet = createSheet("Public GKE Clusters", ["Project", "Name", "Version", "API Public Endpoint IP", "Authentication Methods", "Legacy ABAC", "Workload Identity", "API Authorized Networks",  "Status", "Creation Time"]);

  // https://cloud.google.com/kubernetes-engine/docs/reference/rest/v1/projects.locations.clusters
  var assetTypes = "container.googleapis.com/Cluster";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      if ((!data.hasOwnProperty('privateClusterConfig') || !data.privateClusterConfig.hasOwnProperty('enablePrivateEndpoint')) && data.status == 'RUNNING') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], data.name, data.currentMasterVersion, data.hasOwnProperty('privateClusterConfig') ? data.privateClusterConfig.publicEndpoint : data.endpoint, Object.keys(data.masterAuth).sort().join(","), Object.keys(data.legacyAbac).length > 0 ? data.legacyAbac.enabled : "FALSE", deepFind(data, "workloadIdentityConfig.workloadPool", "").length > 0 ?  "TRUE": "FALSE", data.hasOwnProperty('masterAuthorizedNetworksConfig') ? (data.masterAuthorizedNetworksConfig.enabled ? data.masterAuthorizedNetworksConfig.cidrBlocks.map((block) => block.cidrBlock).join(",") : "") : "", data.status, data.createTime]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

function auditGKEClusters() {
  initializeGlobals();

  sendGAMP('auditGKEClusters');

  var sheet = createSheet("All GKE Clusters", ["Project", "Name", "Version", "API Public Endpoint IP", "Authentication Methods", "Legacy ABAC", "Workload Identity", "API Authorized Networks",  "Status", "Creation Time"]);

  // https://cloud.google.com/kubernetes-engine/docs/reference/rest/v1/projects.locations.clusters
  var assetTypes = "container.googleapis.com/Cluster";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([[asset.name.split("/")[4], data.name, data.currentMasterVersion, data.hasOwnProperty('privateClusterConfig') ? data.privateClusterConfig.publicEndpoint : data.endpoint, Object.keys(data.masterAuth).sort().join(","), Object.keys(data.legacyAbac).length > 0 ? data.legacyAbac.enabled : "FALSE", deepFind(data, "workloadIdentityConfig.workloadPool", "").length > 0 ?  "TRUE": "FALSE", data.hasOwnProperty('masterAuthorizedNetworksConfig') ? (data.masterAuthorizedNetworksConfig.enabled ? data.masterAuthorizedNetworksConfig.cidrBlocks.map((block) => block.cidrBlock).join(",") : "") : "", data.status, data.createTime]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
      
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// gcloud beta asset list --organization=123456789101 --asset-types='appengine.googleapis.com/Application' --content-type='resource'
// gcloud beta asset list --organization=123456789101 --asset-types='appengine.googleapis.com/Service' --content-type='resource'
function auditPublicAppEngine() {
  sendGAMP('auditPublicAppEngine');

  var sheet = createSheet("Public App Engine", ["Project", "Name", "Status", "Identity-Aware Proxy", "Ingress Traffic", "Location", "Update Time", "Hostname"]);

  // https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services
  var assetTypes = "appengine.googleapis.com/Service";
  var appToServices = {};
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }

    assets.forEach((asset) => {
      var data = asset.resource.data;
      if (data.networkSettings == null || data.networkSettings.ingressTrafficAllowed != "INGRESS_TRAFFIC_ALLOWED_INTERNAL_ONLY") {
        var services = [];
        if (asset.resource.parent in appToServices) {
          services = appToServices[asset.resource.parent];
        }
        services.push(asset);
        appToServices[asset.resource.parent] = services;
      }
    });
    // Logger.log(assets.length);
  });

  // https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps
  var assetTypes = "appengine.googleapis.com/Application";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var assetData = asset.resource.data;
      if (assetData.servingStatus == 'SERVING') {
        services = appToServices[asset.name];
        if (services == null) {
          // Skip these as the App Engine app has been setup, but never deployed
          // var activeRange = sheet.getActiveRange();
          // activeRange.setValues([[asset.resource.data.id, asset.resource.data.name, asset.resource.data.servingStatus, asset.resource.data.iap != null, "INGRESS_TRAFFIC_ALLOWED_ALL", asset.resource.location, asset.resource.data.defaultHostname ]]);
          // sheet.setActiveRange(activeRange.offset(1, 0));
          return;
        }
        services.forEach((service) => {
          var serviceData = service.resource.data;
          var activeRange = sheet.getActiveRange();
          activeRange.setValues([[assetData.id, serviceData.name, assetData.servingStatus, assetData.iap != null, serviceData.networkSettings == null ? "INGRESS_TRAFFIC_ALLOWED_ALL" : serviceData.networkSettings.ingressTrafficAllowed, asset.resource.location, service.updateTime, serviceData.id == "default" ? assetData.defaultHostname : serviceData.id + "-dot-" + assetData.defaultHostname]]);
          sheet.setActiveRange(activeRange.offset(1, 0));
        });
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// Checks for unauthenticated invocations which are allowed by setting allUsers in the service IAM policy
// https://cloud.google.com/run/docs/authenticating/public
// gcloud beta asset list --organization=123456787910  --asset-types='run.googleapis.com/Service'   --content-type='resource'
function auditPublicCloudRun() {
  sendGAMP('auditPublicCloudRun');

  var sheet = createSheet("Public Cloud Run", ["Project", "Name", "Location", "Ingress", "Status", "Last Transition", "Url"]);

  var unauthenticatedServices = new Set();
  fetchIAMPolicies('memberTypes:("allUsers" OR "allAuthenticatedUsers") AND policy.role.permissions:run.routes.invoke', (results) => {
    results.forEach((result) => {
      unauthenticatedServices.add(result.resource);
    });
  });

  // https://cloud.google.com/compute/docs/reference/rest/v1/instances
  var assetTypes = "run.googleapis.com/Service";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var ingress = deepFind(asset, "resource.data.metadata.annotations", {})["run.googleapis.com/ingress"];
      if (ingress != "internal" && asset.resource.data.status.conditions[0].status == "True" && unauthenticatedServices.has(asset.name)) {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.resource.data.metadata.name, asset.resource.location, ingress == null ? "all" : ingress, asset.resource.data.status.conditions[0].type + ": " + asset.resource.data.status.conditions[0].status, asset.resource.data.status.conditions[0].lastTransitionTime, asset.resource.data.status.url]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// gcloud beta asset list --organization=1234567891011 --asset-types='compute.googleapis.com/GlobalForwardingRule' --content-type='resource' --filter="resource.data.loadBalancingScheme='EXTERNAL'" --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.IPAddress, resource.data.portRange, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_global_forwarding_rule.csv
function auditExternalGlobalForwardingRules() {
  sendGAMP('auditExternalGlobalForwardingRules');

  var sheet = createSheet("External Global Forwarding Rules", ["Project", "Name", "IP Address", "Port Range", "Load Balancing Scheme", "Creation Time"]);

  // https://cloud.google.com/compute/docs/reference/rest/v1/globalForwardingRules
  var assetTypes = "compute.googleapis.com/GlobalForwardingRule";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      if (asset.resource.data.loadBalancingScheme == 'EXTERNAL' || asset.resource.data.loadBalancingScheme == 'EXTERNAL_MANAGED') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.resource.data.name, asset.resource.data.IPAddress, asset.resource.data.portRange, asset.resource.data.loadBalancingScheme, asset.resource.data.creationTimestamp]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}
// gcloud beta asset list --organization=1234567891011 --asset-types='compute.googleapis.com/ForwardingRule' --content-type='resource' --filter="resource.data.loadBalancingScheme='EXTERNAL'" --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.IPAddress, resource.data.portRange, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_forwarding_rule.csv
function auditExternalForwardingRules() {
  sendGAMP('auditExternalForwardingRules');

  var sheet = createSheet("External Forwarding Rules", ["Project", "Name", "IP Address", "Port Range", "Load Balancing Scheme", "Creation Time"]);

  // https://cloud.google.com/compute/docs/reference/rest/v1/forwardingRules
  var assetTypes = "compute.googleapis.com/ForwardingRule";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      if (asset.resource.data.loadBalancingScheme == 'EXTERNAL' || asset.resource.data.loadBalancingScheme == 'EXTERNAL_MANAGED') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.resource.data.name, asset.resource.data.IPAddress, asset.resource.data.portRange, asset.resource.data.loadBalancingScheme, asset.resource.data.creationTimestamp]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}
// gcloud beta asset list --organization=1234567891011 --asset-types='compute.googleapis.com/BackendService' --content-type='resource' --filter="resource.data.loadBalancingScheme='EXTERNAL'" --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.protocol, resource.data.port, resource.data.loadBalancingScheme, resource.data.creationTimestamp)" > external_backend_service.csv
function auditExternalBackendServices() {
  sendGAMP('auditExternalBackendServices');

  var sheet = createSheet("External Backend Services", ["Project", "Name", "Protocol", "Port", "Load Balancing Scheme", "Identity-Aware Proxy", "Creation Time"]);

  // https://cloud.google.com/compute/docs/reference/rest/v1/backendServices
  var assetTypes = "compute.googleapis.com/BackendService";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      if (asset.resource.data.loadBalancingScheme == 'EXTERNAL') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.resource.data.name, asset.resource.data.protocol, asset.resource.data.port, asset.resource.data.loadBalancingScheme, asset.resource.data.iap != null ? asset.resource.data.iap.enabled : false, asset.resource.data.creationTimestamp]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

function auditExternalRegionalBackendServices() {
  sendGAMP('auditExternalRegionalBackendServices');

  var sheet = createSheet("External Regional Backend Services", ["Project", "Name", "Region", "Protocol", "Port", "Load Balancing Scheme", "Identity-Aware Proxy", "Creation Time"]);

  // https://cloud.google.com/compute/docs/reference/rest/v1/regionBackendServices
  var assetTypes = "compute.googleapis.com/RegionBackendService";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      // Logger.log(JSON.stringify(asset));
      if (asset.resource.data.loadBalancingScheme == 'EXTERNAL') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[asset.name.split("/")[4], asset.resource.data.name, asset.resource.data.region.split("/")[8], asset.resource.data.protocol, asset.resource.data.port, asset.resource.data.loadBalancingScheme, asset.resource.data.iap != null ? asset.resource.data.iap.enabled : false, asset.resource.data.creationTimestamp]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

/////// Queries for listing all assets
// gcloud beta asset list --organization=1234567891011 --asset-types='bigquery.googleapis.com/Dataset' --content-type='resource' --format="csv(resource.data.datasetReference.projectId, resource.data.datasetReference.datasetId, resource.data.location, resource.data.creationTime)" > bigquery_datasets.csv
// gcloud beta asset list --organization=1234567891011 --asset-types='compute.googleapis.com/Instance' --content-type='resource' --format="csv(name.scope(projects).segment(0), resource.data.name, resource.data.selfLink.scope(zones).segment(0), resource.data.status)" --filter="resource.data.status='RUNNING'" > running_instances.csv
// gcloud beta asset list --organization=1234567891011 --asset-types='sqladmin.googleapis.com/Instance' --content-type='resource' --format="csv(resource.data.project, resource.data.name, resource.data.gceZone, resource.data.settings.ipConfiguration.ipv4Enabled, resource.data.settings.ipConfiguration.requireSsl, resource.data.serverCaCert.createTime, resource.data.settings.activationPolicy)" --filter="resource.data.settings.activationPolicy='ALWAYS'" > all_cloudsql_instances.csv
// gcloud beta asset list --organization=1234567891011 --asset-types='spanner.googleapis.com/Instance' --content-type='resource' --format="csv(name.sc
// ope(projects).segment(0), name.scope(instances), resource.data.config.scope(instanceConfigs), resource.data.state)" --filter="resource.data.state='READY'" > all_spanner_instances.csv
// gcloud beta asset list --organization=1234567891011 --asset-types='cloudfunctions.googleapis.com/CloudFunction' --content-type='resource' --format="csv(name.scope(projects).segment(0), name.scope(functions).segment(0), name.scope(locations).segment(0), resource.data.updateTime, resource.data.status)" --filter='resource.data.status="ACTIVE"' > all_running_cloud_functions.csv
// gcloud beta asset list --organization=1234567891011 --asset-types='dataproc.googleapis.com/Cluster' --content-type='resource' --format="csv(name.scope(projects).segment(0), resource.data.clusterName, name.scope(regions).segment(0), resource.data.status.state, resource.data.status.stateStartTime)" --filter="resource.data.status.state='RUNNING'" > all_running_dataproc_clusters.csv


/////// Script for listing all project utiliization reccommendations
// ### https://cloud.google.com/recommender/docs/unattended-project-recommender#recommender_id
// ### https://github.com/GoogleCloudPlatform/cloud-shell-tutorials/blob/master/cloud-console-tutorials/active_assist_recommenders/unattended_project_recommender.md
// #!/bin/bash
// set -euo pipefail

// operating_project="project-1234"
// for project in $(gcloud projects list --format="value(projectId)")
// do
//     recommendation_id=$(gcloud recommender recommendations list --project=$project --billing-project=$operating_project --recommender=google.resourcemanager.projectUtilization.Recommender --verbosity error --format="value(RECOMMENDATION_ID)" --location=global )

//     if [ -z "$recommendation_id" ]
//     then
//        :
//     else
//        subtype=$(gcloud recommender recommendations describe $recommendation_id --project=$project --billing-project=$operating_project --recommender=google.resourcemanager.projectUtilization.Recommender --location=global | sed 's/\|/ /' | awk '/recommenderSubtype:/ {print $2}')

//       if [ -z "$subtype" ]; then : 
//       else printf "Project ID:  $project\nRecommendation: $subtype\n \n"
//       fi
//     fi
// done
function fetchAllProjectRecommendations(recommenderID, filter, callback) {
  allProjectIDs.forEach((projectID) => {
    try {
      fetchAllRecommendations('projects/' + projectID, recommenderID, filter, callback);
    } catch (error) {
      // If the project isn't apart of the organization, then this request will fail with a 403
      if (error.message.includes("Request failed for https://recommender.googleapis.com returned code 403")) {
        Logger.log('Project ' + projectID + ' is not apart of the organization ' + organizationID + ' and cannot access Recommender API');
      } else {
        throw error;
      }
    }
  });
}

function fetchAllFolderRecommendations(recommenderID, filter, callback) {
  allFolderNumbers.forEach((folderNumber) => {
    fetchAllRecommendations('folders/' + folderNumber, recommenderID, filter, callback);
  });
}

function fetchAllOrganizationRecommendations(recommenderID, filter, callback) {
  fetchAllRecommendations('organizations/' + organizationID, recommenderID, filter, callback);
}

function fetchAllRecommendations(parent, recommenderID, filter, callback) {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };

  var nextPageToken = "";
  while (nextPageToken != null) {
    // https://cloud.google.com/recommender/docs/reference/rest/v1/projects.locations.recommenders.recommendations/list
    // https://cloud.google.com/recommender/docs/reference/rest/v1/folders.locations.recommenders.recommendations/list
    // https://cloud.google.com/recommender/docs/reference/rest/v1/organizations.locations.recommenders.recommendations/list
    Logger.log('https://recommender.googleapis.com/v1/' + parent + '/locations/global/recommenders/' + recommenderID + '/recommendations?' + (filter != null ? 'filter=' + filter + '&' : '') + 'pageSize=1000&pageToken=' + nextPageToken)
    var response = UrlFetchApp.fetch('https://recommender.googleapis.com/v1/' + parent + '/locations/global/recommenders/' + recommenderID + '/recommendations?' + (filter != null ? 'filter=' + filter + '&' : '') + '&pageSize=1000&pageToken=' + nextPageToken, options);
    var jsonResponse = JSON.parse(response.getContentText());
    if (Object.keys(jsonResponse).length > 0 && jsonResponse.recommendations.length > 0) {
      callback(parent.split('/')[1], jsonResponse.recommendations);
    }
    nextPageToken = jsonResponse.nextPageToken;
  }


}

function auditUnattendedProjects() {
  sendGAMP('auditUnattendedProjects');

  initializeGlobals();

  var sheet = createSheet("Unused Projects", ["Project", "Recommendation", "Priority", "State", "Refresh Time", "Description"]);

  // https://cloud.google.com/recommender/docs/recommenders
  fetchAllProjectRecommendations("google.resourcemanager.projectUtilization.Recommender", "recommenderSubtype=CLEANUP_PROJECT", (projectID, recommendations) => {
    recommendations.forEach((recommendation) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([[projectID, recommendation.recommenderSubtype, recommendation.priority, recommendation.stateInfo.state, recommendation.lastRefreshTime, recommendation.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();

  });
}

// https://cloud.google.com/iam/docs/recommender-overview#how-recommender-works
function auditIAMRecommendations() {
  sendGAMP('auditIAMRecommendations');

  initializeGlobals();

  var sheet = createSheet("IAM Recommendations", ["Resource Level", "Resource Name", "Recommendation", "Priority", "State", "Refresh Time", "Resource", "Role(s) to Add", "Role to Remove", "Principle"]);

  // https://cloud.google.com/recommender/docs/recommenders
  fetchAllOrganizationRecommendations("google.iam.policy.Recommender", "stateInfo.state=ACTIVE", (orgID, recommendations) => {
    recommendations.forEach((recommendation) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([["Organization", orgID, recommendation.recommenderSubtype, recommendation.priority, recommendation.stateInfo.state, recommendation.lastRefreshTime].concat(extractIAMRecommendationContent(recommendation))]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });

  fetchAllFolderRecommendations("google.iam.policy.Recommender", "stateInfo.state=ACTIVE", (folderID, recommendations) => {
    recommendations.forEach((recommendation) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([["Folder", allFolderNumbersToFolder[folderID].displayName, recommendation.recommenderSubtype, recommendation.priority, recommendation.stateInfo.state, recommendation.lastRefreshTime].concat(extractIAMRecommendationContent(recommendation))]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });

  fetchAllProjectRecommendations("google.iam.policy.Recommender", "stateInfo.state=ACTIVE", (projectID, recommendations) => {
    recommendations.forEach((recommendation) => {
      var activeRange = sheet.getActiveRange();
      // Logger.log(recommendation);
      // Logger.log(Object.keys(recommendation));
      // Logger.log(recommendation.content.overview.addedRoles);
      activeRange.setValues([["Project", projectID, recommendation.recommenderSubtype, recommendation.priority, recommendation.stateInfo.state, recommendation.lastRefreshTime].concat(extractIAMRecommendationContent(recommendation))]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });
}

function extractIAMRecommendationContent(recommendation) {
  var overview = recommendation.content.overview;
  var operations = recommendation.content.operationGroups[0].operations;

  if (overview.resource == null) {
    // For REPLACE_ROLE_CUSTOMIZABLE recommendations which don't contain an overview
    var addOperations = operations.filter((operation) => operation.action == "add")
    var removeOperations = operations.filter((operation) => operation.action == "remove")

    return [operations[0].resource.split("/").slice(3).join('/'), addOperations.map((op) => op.pathFilters["/iamPolicy/bindings/*/role"]).join(', '), removeOperations.map((op) => op.pathFilters["/iamPolicy/bindings/*/role"]).join(', '), operations.map((op) => op.pathFilters["/iamPolicy/bindings/*/members/*"]).filter((member) => member != null && member != "").join(', ')]
  } else {
    return [overview.resource.split("/").slice(3).join('/'), overview.addedRoles == null ? "" : overview.addedRoles.join(', '), overview.removedRole, overview.member];
  }
}

function fetchAllProjectInsights(insightID, filter, callback) {
  allProjectIDs.forEach((projectID) => {
    try {
      fetchAllInsights('projects/' + projectID, insightID, filter, callback);
    } catch (error) {
      // If the project isn't apart of the organization, then this request will fail with a 403
      if (error.message.includes("Request failed for https://recommender.googleapis.com returned code 403")) {
        Logger.log('Project ' + projectID + ' is not apart of the organization ' + organizationID + ' and cannot access Recommender API');
      } else {
        throw error;
      }
    }
  });
}

function fetchAllFolderInsights(insightID, filter, callback) {
  allFolderNumbers.forEach((folderNumber) => {
    fetchAllInsights('folders/' + folderNumber, insightID, filter, callback);
  });
}

function fetchAllOrganizationInsights(insightID, filter, callback) {
  fetchAllInsights('organizations/' + organizationID, insightID, filter, callback);
}

// https://cloud.google.com/recommender/docs/insights/using-insights
function fetchAllInsights(parent, insightID, filter, callback) {
  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };

  var nextPageToken = "";
  while (nextPageToken != null) {
    // https://cloud.google.com/recommender/docs/reference/rest/v1/projects.locations.insightTypes.insights/list
    // https://cloud.google.com/recommender/docs/reference/rest/v1/folders.locations.insightTypes.insights/list
    // https://cloud.google.com/recommender/docs/reference/rest/v1/organizations.locations.insightTypes.insights/list
    Logger.log('https://recommender.googleapis.com/v1/' + parent + '/locations/global/insightTypes/' + insightID + '/insights?' + (filter != null ? 'filter=' + filter + '&' : '') + 'pageSize=1000&pageToken=' + nextPageToken)
    var response = UrlFetchApp.fetch('https://recommender.googleapis.com/v1/' + parent + '/locations/global/insightTypes/' + insightID + '/insights?' + (filter != null ? 'filter=' + filter + '&' : '') + 'pageSize=1000&pageToken=' + nextPageToken, options);
    var jsonResponse = JSON.parse(response.getContentText());
    if (Object.keys(jsonResponse).length > 0 && jsonResponse.insights.length > 0) {
      callback(parent.split("/")[1], jsonResponse.insights);
    }
    nextPageToken = jsonResponse.nextPageToken;
  }
}

// https://cloud.google.com/iam/docs/manage-policy-insights
function auditPolicyInsights() {
  sendGAMP('auditPolicyInsights');

  initializeGlobals();

  var sheet = createSheet("IAM Policy Insights", ["Resource Level", "Resource Name", "Insight", "State", "Refresh Time", "Member", "Role", "Exercised Permissions", "Inferred Permissions", "Description"]);

  // https://cloud.google.com/recommender/docs/insights/insight-types
  fetchAllOrganizationInsights("google.iam.policy.Insight", "stateInfo.state=ACTIVE", (orgID, insights) => {
    insights.forEach((insight) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([["Organization", orgID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.member, insight.content.role, insight.content.exercisedPermissions.map((permission) => permission['permission']).join(", ").substring(0,49999), insight.content.inferredPermissions.map((permission) => permission['permission']).join(", ").substring(0,49999), insight.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });

  fetchAllFolderInsights("google.iam.policy.Insight", "stateInfo.state=ACTIVE", (folderID, insights) => {
    insights.forEach((insight) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([["Folder", allFolderNumbersToFolder[folderID].displayName, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.member, insight.content.role, insight.content.exercisedPermissions.map((permission) => permission['permission']).join(", "), insight.content.inferredPermissions.map((permission) => permission['permission']).join(", "), insight.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });

  fetchAllProjectInsights("google.iam.policy.Insight", "stateInfo.state=ACTIVE", (projectID, insights) => {
    insights.forEach((insight) => {
      var activeRange = sheet.getActiveRange();
      activeRange.setValues([["Project", projectID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.member, insight.content.role, insight.content.exercisedPermissions.map((permission) => permission['permission']).join(", "), insight.content.inferredPermissions.map((permission) => permission['permission']).join(", "), insight.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });
}

// https://cloud.google.com/asset-inventory/docs/using-asset-insights
function auditAssetInsights() {
  sendGAMP('auditAssetInsights');

  initializeGlobals();

  // var sheet = createSheet("Asset Insights", ["Resource Level", "Resource Name", "Insight", "State", "Refresh Time", "User", "Domain", "Asset Name", "Policy Search Query", "Description"]);
  var sheet = createSheet("Asset Insights", ["Project", "Insight", "State", "Refresh Time", "User", "Domain", "Asset Name", "Policy Search Query", "Description"]);

  // Asset Insights are duplicated across organizations and folders, so only display project level asset insights
  // https://cloud.google.com/recommender/docs/insights/insight-types
  // fetchAllOrganizationInsights("google.cloudasset.asset.Insight", "stateInfo.state=ACTIVE", (orgID, insights) => {
  //   insights.forEach((insight) => {
  //     var activeRange = sheet.getActiveRange();
  //     activeRange.setValues([["Organization", orgID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.user, insight.content.domain, insight.content.assetName, insight.content.policySearchQuery, insight.description]]);
  //     sheet.setActiveRange(activeRange.offset(1, 0));
  //   });
  //   SpreadsheetApp.flush();
  // });

  // fetchAllFolderInsights("google.cloudasset.asset.Insight", "stateInfo.state=ACTIVE", (folderID, insights) => {
  //   insights.forEach((insight) => {
  //     var activeRange = sheet.getActiveRange();
  //     activeRange.setValues([["Folder", allFolderNumbersToFolder[folderID].displayName, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.user, insight.content.domain, insight.content.assetName, insight.content.policySearchQuery, insight.description]]);
  //     sheet.setActiveRange(activeRange.offset(1, 0));
  //   });
  //   SpreadsheetApp.flush();
  // });

  // https://cloud.google.com/recommender/docs/insights/insight-types
  fetchAllProjectInsights("google.cloudasset.asset.Insight", "stateInfo.state=ACTIVE", (projectID, insights) => {
    insights.forEach((insight) => {
      var activeRange = sheet.getActiveRange();
      // activeRange.setValues([["Project", projectID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.user, insight.content.domain, insight.content.assetName, insight.content.policySearchQuery, insight.description]]);
      activeRange.setValues([[projectID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.user, insight.content.domain, insight.content.assetName, insight.content.policySearchQuery, insight.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });
}

// https://cloud.google.com/iam/docs/manage-lateral-movement-insights
function auditLateralMovementInsights() {
  sendGAMP('auditLateralMovementInsights');

  initializeGlobals();

  var sheet = createSheet("Lateral Movement Insights", ["Project", "Insight", "State", "Refresh Time", "Impersonator Service Account", "Target Service Account", "Impersonation Role", "Impersonation Resource", "Description"]);

  // https://cloud.google.com/recommender/docs/insights/insight-types
  fetchAllProjectInsights("google.iam.policy.LateralMovementInsight", "stateInfo.state=ACTIVE", (projectID, insights) => {
    insights.forEach((insight) => {

      insight.content.targetServiceAccounts.forEach((targetServiceAccount) => {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[projectID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.impersonator.serviceAccount, targetServiceAccount, insight.content.impersonationPolicy.role, insight.content.impersonationPolicy.resource, insight.description]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      });
    });
    SpreadsheetApp.flush();

  });
}

// https://cloud.google.com/iam/docs/manage-service-account-insights
function auditServiceAccountInsights() {
  sendGAMP('auditServiceAccountInsights');

  initializeGlobals();

  var sheet = createSheet("Service Account Insights", ["Project", "Insight", "State", "Refresh Time", "Service Account", "Last Authenticated Time", "Description"]);

  // https://cloud.google.com/recommender/docs/insights/insight-types
  fetchAllProjectInsights("google.iam.serviceAccount.Insight", "stateInfo.state=ACTIVE", (projectID, insights) => {
    insights.forEach((insight) => {
      var activeRange = sheet.getActiveRange();
      // Logger.log(JSON.stringify(insight));
      activeRange.setValues([[projectID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.content.email, insight.content.lastAuthenticatedTime, insight.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });
}

// https://cloud.google.com/network-intelligence-center/docs/firewall-insights/how-to/using-firewall-insights
function auditFirewallInsights() {
  sendGAMP('auditFirewallInsights');

  initializeGlobals();

  var sheet = createSheet("Firewall Insights", ["Project", "Insight", "State", "Refresh Time", "Description"]);

  // https://cloud.google.com/recommender/docs/insights/insight-types
  fetchAllProjectInsights("google.compute.firewall.Insight", "stateInfo.state=ACTIVE", (projectID, insights) => {
    insights.forEach((insight) => {
      var activeRange = sheet.getActiveRange();
      // Logger.log(JSON.stringify(insight));
      activeRange.setValues([[projectID, insight.insightSubtype, insight.stateInfo.state, insight.lastRefreshTime, insight.description]]);
      sheet.setActiveRange(activeRange.offset(1, 0));
    });
    SpreadsheetApp.flush();
  });
}

// gcloud projects list --format="value(projectId)" | xargs -t -I {} \
//   gcloud alpha services api-keys list --project={} --billing-project=$OPERATING_PROJECT \
//     --format="csv(name.segement(1), displayName, uid, createTime)"
// https://cloud.google.com/api-keys/docs/reference/rest/v2/projects.locations.keys/list
// https://github.com/ScaleSec/gcp_api_key_inventory/blob/main/apiInventory.py
function auditAPIKeys() {
  sendGAMP('auditAPIKeys');

  initializeGlobals();

  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };

  var sheet = createSheet("API Keys", ["Project", "Name", "API Restrictions", "Referrer Restrictions", "IP Restrictions", "Android App Restrictions", "iOS App Restrictions", "Creation Time"])

  allProjectIDs.forEach((projectID) => {
    try {
      var nextPageToken = "";
      Logger.log('https://apikeys.googleapis.com/v2/projects/' + projectID + '/locations/global/keys?pageSize=300&pageToken=' + nextPageToken)
      var response = UrlFetchApp.fetch('https://apikeys.googleapis.com/v2/projects/' + projectID + '/locations/global/keys?&pageSize=300&pageToken=' + nextPageToken, options);
      var jsonResponse = JSON.parse(response.getContentText());
      if (Object.keys(jsonResponse).length > 0 && jsonResponse.keys.length > 0) {
        jsonResponse.keys.forEach((key) => {
          var activeRange = sheet.getActiveRange();
          activeRange.setValues([[projectID, "=HYPERLINK(\"https://console.cloud.google.com/apis/credentials/key/" + key.uid + "?project=" + projectID + "\",\"" + key.displayName + "\")", deepFind(key, "restrictions.apiTargets", []).map((api) => api.service).join(","), deepFind(key, "restrictions.browserKeyRestrictions.allowedReferrers", []).join(","), deepFind(key, "restrictions.serverKeyRestrictions.allowedIps", []).join(","), deepFind(key, "restrictions.androidKeyRestrictions.allowedApplications", []).map((app) => app.packageName).join(","), deepFind(key, "restrictions.iosKeyRestrictions.allowedBundleIds", []).join(","), key.createTime]]);
          sheet.setActiveRange(activeRange.offset(1, 0));
        });
        SpreadsheetApp.flush();
      }
      nextPageToken = jsonResponse.nextPageToken;
    } catch (error) {
      // If the project isn't apart of the organization, then this request will fail with a 403
      if (error.message.includes("Request failed for https://apikeys.googleapis.com returned code 403")) {
        Logger.log('Project ' + projectID + ' is not apart of the organization ' + organizationID + ' and cannot access API Keys API');
      } else {
        throw error;
      }
    }
  });

}

// https://cloud.google.com/bigquery-transfer/docs/reference/datatransfer/rest/v1/projects.locations.transferConfigs/list
// https://cloud.google.com/bigquery/docs/scheduling-queries#viewing_a_scheduled_query
function auditBigQueryUserScheduledQueries() {
  sendGAMP('auditBigQueryUserScheduledQueries');

  initializeGlobals();

  var oauthToken = ScriptApp.getOAuthToken();
  var options = {
    'method': 'get',
    'contentType': 'application/json',
    'headers': {
      'x-goog-user-project': operatingProjectID,
      'Authorization': 'Bearer ' + oauthToken,
    }
  };

  var sheet = createSheet("BQ User Scheduled Queries", ["Project", "Name", "User Email",
    "Data Source ID", "Schedule", "Next Run Time", "Update Time"])

  allProjectIDs.forEach((projectID) => {
    try {
      var nextPageToken = "";
      Logger.log('https://bigquerydatatransfer.googleapis.com/v1/projects/' + projectID + '/locations/us/transferConfigs?pageSize=300&pageToken=' + nextPageToken)
      var response = UrlFetchApp.fetch('https://bigquerydatatransfer.googleapis.com/v1/projects/' + projectID + '/locations/us/transferConfigs?&pageSize=300&pageToken=' + nextPageToken, options);
      var jsonResponse = JSON.parse(response.getContentText());
      if (Object.keys(jsonResponse).length > 0 && jsonResponse.transferConfigs.length > 0) {
        jsonResponse.transferConfigs.forEach((transferConfig) => {
          if (!transferConfig.disabled && transferConfig.hasOwnProperty('schedule')) { // && transferConfig.dataSourceId == "scheduled_query") { // && transferConfig.ownerInfo.email) {
            // Listed transferConfig doesn't include ownerInfo for some reason, need to get them individually
            Logger.log('https://bigquerydatatransfer.googleapis.com/v1/' + transferConfig.name)
            var getResponse = UrlFetchApp.fetch('https://bigquerydatatransfer.googleapis.com/v1/' + transferConfig.name, options);
            transferConfig = JSON.parse(getResponse.getContentText());
            if (transferConfig.hasOwnProperty('ownerInfo') && !transferConfig.ownerInfo.email.endsWith(".gserviceaccount.com")) {
              var activeRange = sheet.getActiveRange();
              Logger.log(transferConfig)
              activeRange.setValues([[projectID, transferConfig.displayName, transferConfig.ownerInfo.email,
                transferConfig.dataSourceId, transferConfig.schedule, transferConfig.nextRunTime, transferConfig.updateTime]]);
              sheet.setActiveRange(activeRange.offset(1, 0));
            }
          }
        });
        SpreadsheetApp.flush();
      }
      nextPageToken = jsonResponse.nextPageToken;
    } catch (error) {
      // If the project isn't apart of the organization, then this request will fail with a 403
      if (error.message.includes("Request failed for https://bigquerydatatransfer.googleapis.com returned code 403")) {
        Logger.log('Project ' + projectID + ' is not apart of the organization ' + organizationID + ' and cannot access BigQuery Data Transfer Service API');
      } else {
        throw error;
      }
    }
  });

}


function auditAllGCEVMs() {
  sendGAMP('auditAllGCEVMs');

  initializeGlobals();

  var sheet = createSheet("All GCE VMs", ["Project", "Name", "Machine Type", "Source Image", "External IP", "Internal IP", "Status", "Creation Time", "Last Start Time"]);

  var allDiskLinkToDisk = {};

  // https://cloud.google.com/compute/docs/reference/rest/v1/disks
  var assetTypes = "compute.googleapis.com/Disk";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => allDiskLinkToDisk[asset.resource.data.selfLink] = asset);
  });

  // https://cloud.google.com/compute/docs/reference/rest/v1/instances
  var assetTypes = "compute.googleapis.com/Instance";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      if (deepFind(asset, "resource.data.status", '') == 'RUNNING') {
        var activeRange = sheet.getActiveRange();
        
        var bootDisk = allDiskLinkToDisk[data.disks.find((disk) => disk.boot).source];

        activeRange.setValues([[asset.name.split("/")[4], data.name, data.machineType.split("/").pop(), bootDisk ? (bootDisk.resource.data.hasOwnProperty('sourceImage') ? bootDisk.resource.data.sourceImage.split("/")[9] : bootDisk.resource.data.name) : "", data.networkInterfaces[0].hasOwnProperty('accessConfigs') ? data.networkInterfaces[0].accessConfigs[0].natIP : "", data.networkInterfaces[0].networkIP, data.status, data.creationTimestamp, data.lastStartTimestamp]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}

// gcloud beta asset list --organization=1234567891011 --asset-types='sqladmin.googleapis.com/Instance' --content-type='resource' --format="csv(resource.data.project, resource.data.name, resource.data.gceZone, resource.data.settings.ipConfiguration.ipv4Enabled, resource.data.settings.ipConfiguration.requireSsl, resource.data.serverCaCert.createTime, resource.data.settings.activationPolicy)" --filter="resource.data.settings.activationPolicy='ALWAYS'" > cloudsql_instances.csv
function auditAllCloudSQLInstances() {
  sendGAMP('auditAllCloudSQLInstances');

  initializeGlobals();

  var sheet = createSheet("All CloudSQL Instances", ["Project", "Name", "Version", "GCE Zone", "Public IP Enabled", "Require SSL", "Authorized Networks", "Create Time", "Activation Policy"]);

  // https://cloud.google.com/sql/docs/mysql/admin-api/rest/v1beta4/instances
  var assetTypes = "sqladmin.googleapis.com/Instance";
  fetchAllAssets(assetTypes, (assets) => {
    if (assets == null) {
      return;
    }
    assets.forEach((asset) => {
      var data = asset.resource.data;
      var ipConfig = data.settings.ipConfiguration;
      if (data.settings.activationPolicy == 'ALWAYS') {
        var activeRange = sheet.getActiveRange();
        activeRange.setValues([[data.project, data.name, data.databaseVersion, data.gceZone, ipConfig.ipv4Enabled, ipConfig.requireSsl, ipConfig.hasOwnProperty('authorizedNetworks') ? ipConfig.authorizedNetworks.map((acl) => acl.value).join(",") : "", data.createTime, data.settings.activationPolicy]]);
        sheet.setActiveRange(activeRange.offset(1, 0));
      }
    });
    // Logger.log(assets.length);
    SpreadsheetApp.flush();
  });
}
