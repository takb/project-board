const core = require('@actions/core');
const github = require("@actions/github");

async function getProject(octokit, owner, repo, id) {
  var projectList = await octokit.projects.listForRepo({
    owner,
    repo
  });
  if (projectList.status != 200) {
    throw new Error('insufficient access privilege to fetch project data, check owner/repo');
  }
  var project = projectList.data.find(e => e.number == id);
  if (!project) {
    throw new Error('failed to fetch project data, check project id');
  }
  return project;
}

async function getColumnForIssue(octokit, project, payload, columnByLabel, defaultToFirst = true) {
  var targetColumnName = '';
  for (const label of payload.issue.labels) {
    if (columnByLabel[label.name]) {
      targetColumnName = columnByLabel[label.name];
      break;
    }
  }
  var columnList = await octokit.projects.listColumns({
    project_id: project.id
  });
  if (!columnList.data.length) {
    throw new Error('error fetching columns, check if project board is set up properly');
  }
  if (targetColumnName) {
    var targetColumnId = columnList.data.find(e => e.name == targetColumnName).id;
    if (targetColumnId) {
      return targetColumnId;
    } else {
      console.log(`WARNING: column name '${targetColumnName}' not found in project, adding to default`);
    }
  }
  return defaultToFirst ? columnList.data[0].id : 0;
}

async function getCardForIssue(octokit, project, payload, targetColumnId) {
  var issueNum = payload.issue.number;
  if (!issueNum) {
    throw new Error('invalid context: no issue number');
  }
  var columnList = await octokit.projects.listColumns({
    project_id: project.id
  });
  if (!columnList.data.length) {
    throw new Error('error fetching columns, check if project board is set up properly');
  }
  var targetCard;
  for (const column of columnList.data) {
    var cardList = await octokit.projects.listCards({
      column_id: column.id
    });
    for (const card of cardList.data) {
      console.log(card)
      if (card.content_url.substring(card.content_url.lastIndexOf('/')+1) == issueNum) {
        targetCard = card
        break;
      }
    }
    if (targetCard) {
      break;
    }
  }

  if (!targetCard) {
    console.log(`Issue ${issueId} not in project, nothing to do`);
    return;
  }

  console.log(targetCard)
  return;
}

async function handleIssueOpened(octokit, project, payload, columnByLabel) {
  var issueId = payload.issue.id;
  if (!issueId) {
    throw new Error('invalid context: no issue ID');
  }
  var columnId = await getColumnForIssue(octokit, project, payload, columnByLabel);
  if (!columnId) {
    throw new Error('invalid project setup: no default column');
  }
  console.log(`Adding issue ${issueId} to column ${columnId}`);
  await octokit.projects.createCard({
      column_id: columnId,
      content_id: issueId,
      content_type: "Issue"
  });
}

async function handleIssueLabeled(octokit, project, payload, columnByLabel) {
  var issueId = payload.issue.id;
  if (!issueId) {
    throw new Error('invalid context: no issue ID');
  }
  var columnId = await getColumnForIssue(octokit, project, payload, columnByLabel, false);
  if (!columnId) {
    console.log(`Issue ${issueId} has no target column to move to, nothing to do`);
    return;
  }
  var cardId = await getCardForIssue(octokit, project, payload, columnId);
  if (!cardId) {
    return;
  }
  console.log(`Moving issue ${cardId} to column ${columnId}`);
  // await octokit.projects.createCard({
  //     column_id: columnId,
  //     content_id: issueId,
  //     content_type: "Issue"
  // });
}

let handler = function(token, owner, repo, id, columnByLabelStr) {
  if (typeof(token) !== 'string' || token.length != 40) {
    throw new Error('invalid token');
  }
  if (typeof(owner) !== 'string' || !owner.length) {
    throw new Error('invalid owner');
  }
  if (typeof(repo) !== 'string' || !repo.length) {
    throw new Error('invalid repo');
  }
  if (typeof(id) !== 'string' || !id.length) {
    throw new Error('invalid project id');
  }
  var columnByLabel = {};
  if (typeof(columnByLabelStr) == 'string' && columnByLabelStr.length) {
    columnByLabel = JSON.parse(columnByLabelStr);
  }
  return new Promise(async(resolve, reject) => {
    const octokit = new github.GitHub(token);
    try {
      var project = await getProject(octokit, owner, repo, id);
    } catch (e) {
      reject(e);
    }
    const context = github.context;
    // const context = {eventName: 'issues', payload: {action: 'opened', issue: {id: 123}}};
    switch (context.eventName) {
      case 'issues':
        if (context.payload.action == 'opened') {
          console.log('triggered by new issue')
          try {
            await handleIssueOpened(octokit, project, context.payload, columnByLabel);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        if (context.payload.action == 'labeled') {
          console.log('triggered by label add')
          try {
            handleIssueLabeled(octokit, project, context.payload, columnByLabel);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        break;
      case 'pull_request':
        console.log('triggered by PR')
        try {
          handlePR(octokit, project, context.payload);
          resolve("done!");
        } catch (e) {
          reject(e);
        }
        break;
      case 'release':
        console.log('triggered by release')
        try {
          handleRelease(octokit, project, context.payload);
          resolve("done!");
        } catch (e) {
          reject(e);
        }
        break;
      default:
        break;
    }
    reject({message: 'unhandled trigger: ' + context.eventName});
  });
}

module.exports = handler;
