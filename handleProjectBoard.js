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

async function getCardForIssue(octokit, project, payload, targetColumnId, ignoreColumnNames) {
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
  var currentColumnId;
  var currentColumnName;
  for (const column of columnList.data) {
    var cardList = await octokit.projects.listCards({
      column_id: column.id
    });
    for (const card of cardList.data) {
      if (card.content_url.substring(card.content_url.lastIndexOf('/')+1) == issueNum) {
        targetCard = card;
        currentColumnId = column.id;
        currentColumnName = column.name;
        break;
      }
    }
    if (targetCard) {
      break;
    }
  }
  if (!targetCard) {
    console.log(`No card for issue #${issueNum} in project, nothing to do`);
    return;
  }
  if (currentColumnId == targetColumnId) {
    console.log(`Card for issue #${issueNum} already in target column, nothing to do`);
    return;
  }
  if (Array.isArray(ignoreColumnNames) && ignoreColumnNames.includes(currentColumnName)) {
    console.log(`Card for issue #${issueNum} is in column marked to ignore, nothing to do`);
    return;
  }
  return targetCard.id;
}

async function archiveCardIfInColumnName(octokit, issueNum, columnName) {
  if (!issueNum) {
    throw new Error('invalid call: no issue number');
  }
  if (!columnName) {
    throw new Error('invalid call: no column name');
  }
  var columnList = await octokit.projects.listColumns({
    project_id: project.id
  });
  if (!columnList.data.length) {
    throw new Error('error fetching columns, check if project board is set up properly');
  }
  var columnId = 0;
  for (const column of columnList.data) {
    if (column.name == columnName) {
      columnId = column.id;
      break;
    }
  }
  if (!columnId) {
    console.log(`Column '${columnName}' not found, check configuration`);
    return false;
  }
  var cardList = await octokit.projects.listCards({
    column_id: columnId
  });
  for (const card of cardList.data) {
    if (card.content_url.substring(card.content_url.lastIndexOf('/')+1) == issueNum) {
      await octokit.projects.updateCard({
        card_id: card.id,
        archived: true,
      });
      return true;
    }
  }
  return false;
}

async function getCardForIssueAndColumn(octokit, issueNum, columnId) {
  if (!issueNum) {
    throw new Error('invalid call: no issue number');
  }
  if (!columnId) {
    throw new Error('invalid call: no column id');
  }
  var cardList = await octokit.projects.listCards({
    column_id: columnId
  });
  if (!cardList.data.length) {
    return 0;
  }
  for (const card of cardList.data) {
    if (card.content_url.substring(card.content_url.lastIndexOf('/')+1) == issueNum) {
      return card.id;
    }
  }
  return 0;
}

async function getColumnForProject(octokit, project) {
  var columnList = await octokit.projects.listColumns({
    project_id: project.id
  });
  if (!columnList.data.length) {
    throw new Error('error fetching columns, check if project board is set up properly');
  }
  return columnList.data[0].id;
}

// - Add card for new issue to the top of the project's first column OR to a specified column depending on labels set
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
  var issueNum = payload.issue.number;
  if (!issueNum) {
    throw new Error('invalid context: no issue number');
  }
  var cardId = await getCardForIssueAndColumn(octokit, issueNum, columnId);
  await octokit.projects.moveCard({
    card_id: cardId,
    position: "top"
  });
}

// - Move the card for an issue to the top of a specified column depending on labels set
// - If card doesn't exist yet, ignore (github fires a labeled event simultaneously with
//   the issue opened event, at which point no card has been put in the project yet)
async function handleIssueLabeled(octokit, project, payload, columnByLabel, ignoreColumnNames) {
  var issueId = payload.issue.id;
  var issueNum = payload.issue.number;
  if (!issueId) {
    throw new Error('invalid context: no issue ID');
  }
  var columnId = await getColumnForIssue(octokit, project, payload, columnByLabel, false);
  if (!columnId) {
    console.log(`Issue #${issueNum} has no target column to move to, nothing to do`);
    return;
  }
  var cardId = await getCardForIssue(octokit, project, payload, columnId, ignoreColumnNames);
  if (!cardId) {
    return;
  }
  console.log(`Moving card ${cardId} to column ${columnId}`);
  await octokit.projects.moveCard({
    card_id: cardId,
    column_id: columnId,
    position: "top"
  });
}

// - remove from project if card is in specified column
// - add label if set in config
async function handleIssueClosed(octokit, owner, repo, project, payload, labelOnClose, removeOnClose) {
  var issueNum = payload.issue.number;
  if (!issueNum) {
    throw new Error('invalid context: no issue ID');
  }
  if (removeOnClose) {
    console.log(`Checking if issue #${issueNum} should be removed`);
    var removed = await archiveCardIfInColumnName(octokit, issueNum, removeOnClose);
    if (removed) {
      console.log(`Removed #${issueNum} because it still was in column '${removeOnClose}'`);
      return;
    }
  }
  if (!labelOnClose) {
    console.log(`No labelOnClose set, nothing to do`);
    return;
  }
  console.log(`Adding label '${labelOnClose}' to closed issue ${issueNum}`);
  await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: issueNum,
    labels: [labelOnClose],
  });
}

// - add card to project first column
async function handlePullRequestOpened(octokit, project, payload) {
  var prId = payload.pull_request.id;
  if (!prId) {
    throw new Error('invalid context: no pull request ID');
  }
  var columnId = await getColumnForProject(octokit, project);
  console.log(`Adding PR ${prId} to column ${columnId}`);
  await octokit.projects.createCard({
    column_id: columnId,
    content_id: prId,
    content_type: "PullRequest"
  });
}

async function handlePullRequestClosed(octokit, project, payload) {
  // TODO: implement.
  // - add label
}

async function handleReleaseCreated(octokit, project, payload) {
  // TODO: implement.
  // - remove all 'awaiting release' tags from closed isues
  // - close and remove 'awaiting release' tags from all open tags in 'awaiting release' column
  // - archive all cards in 'last release' column
  // - move all cards in 'awaiting release' column to 'last release' column
}

let handler = function(token, owner, repo, id, columnByLabelStr, ignoreColumnNamesStr, labelOnClose = "", removeOnClose = "", mockOctokit = false, mockContext = false) {
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
  var ignoreColumnNames = {};
  if (typeof(ignoreColumnNamesStr) == 'string' && ignoreColumnNamesStr.length) {
    ignoreColumnNames = ignoreColumnNamesStr.split(',')
  }
  return new Promise(async(resolve, reject) => {
    const octokit = mockOctokit || new github.GitHub(token);
    try {
      var project = await getProject(octokit, owner, repo, id);
    } catch (e) {
      reject(e);
    }
    const context = mockContext || github.context;
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
            handleIssueLabeled(octokit, project, context.payload, columnByLabel, ignoreColumnNames);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        if (context.payload.action == 'closed') {
          console.log('triggered by closed issue')
          try {
            handleIssueClosed(octokit, owner, repo, project, context.payload, labelOnClose, removeOnClose);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        break;
      case 'pull_request':
        if (context.payload.action == 'opened') {
          console.log('triggered by new pull request')
          try {
            handlePullRequestOpened(octokit, project, context.payload);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        if (context.payload.action == 'closed') {
          console.log('triggered by new pull request')
          try {
            handleIssueClosed(octokit, owner, repo, context.payload, labelOnClose);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        break;
      case 'release':
        if (context.payload.action == 'created') {
          console.log('triggered by new release')
          try {
            handleReleaseCreated(octokit, project, context.payload);
            resolve("done!");
          } catch (e) {
            reject(e);
          }
        }
        break;
      default:
        break;
    }
    reject({message: 'unhandled trigger: ' + context.eventName});
  });
}

module.exports = handler;
