const React = window.React;
const ReactDOM = window.ReactDOM;
const Icon = window.wagtail.components.Icon;

function Importer(props) {
  const [selectedImageData, setSelectedImageData] = React.useState([]);
  const [duplicateActions, setDuplicateActions] = React.useState(undefined);
  const [duplicateData, setDuplicateData] = React.useState(undefined);
  const [collection, setCollection] = React.useState(props.collections[0][0]);

  function getImageImports() {
    return selectedImageData
      .map((data) => {
        const id = data["id"];
        const duplicateAction = duplicateActions[id];
        return (imageImport = {
          drive_id: id,
          name: data["name"],
          progress: 0,
          action: duplicateActions[id] || "keep",
          thumbnail: data["thumbnailLink"],
          resourceKey: data["resourceKey"],
          wagtail_id:
            duplicateActions[id] == "replace"
              ? duplicateData[id]["wagtail_id"]
              : null,
        });
      })
      .filter((imageImport) => !(imageImport["action"] == "cancel"));
  }

  if (!(selectedImageData && selectedImageData.length)) {
    return (
      <React.Fragment>
        <DriveSelector
          appId={props.appId}
          pickerApiKey={props.pickerApiKey}
          clientId={props.clientId}
          scope="https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/drive.readonly"
          onGetImageData={setSelectedImageData}
          driveParent={props.driveParent || "root"}
        />
        <CollectionSelector
          collections={props.collections}
          selected={collection}
          onChange={(e) => {
            setCollection(e.target.value);
          }}
        />
      </React.Fragment>
    );
  } else if (!duplicateActions) {
    return (
      <DuplicateIdentifier
        imageData={selectedImageData}
        duplicateReviewUrl={props.duplicateReviewUrl}
        onConfirmDuplicateActions={setDuplicateActions}
        onGetDuplicateData={setDuplicateData}
      />
    );
  } else {
    return (
      <FileImporter
        imageImports={getImageImports()}
        csrfToken={props.csrfToken}
        collection={collection}
        tagitOpts={props.tagitOpts}
        indexUrl={props.indexUrl}
      />
    );
  }
}

function CollectionSelector(props) {
  return (
    <div class="field nice-padding import-selector">
      <label for="id_addimage_collection">Add to collection:</label>
      <div class="field-content">
        <select
          id="id_addimage_collection"
          name="collection"
          value={props.selected}
          onChange={props.onChange}
        >
          {props.collections.map((collection) => {
            return <option value={collection[0]}>{collection[1]}</option>;
          })}
        </select>
      </div>
    </div>
  );
}

function FileImporter(props) {
  const [currentlyImporting, setCurrentlyImporting] = React.useState(false);
  const [imageImports, setImageImports] = React.useState(props.imageImports);
  const oauthToken = gapi.auth2
    .getAuthInstance()
    .currentUser.get()
    .getAuthResponse().access_token;

  function setImageParam(paramName, paramValue, index) {
    let newImageImports = [...imageImports];
    newImageImports[index][paramName] = paramValue;
    setImageImports(newImageImports);
  }

  function startImport(newImport, index) {
    setCurrentlyImporting(true);
    var imageRequest = new XMLHttpRequest();
    imageRequest.addEventListener("load", (e) => {
      setImageParam("progress", 50, index);
      uploadToWagtail(
        new File([imageRequest.response], newImport["name"]),
        newImport,
        index
      );
    });
    imageRequest.addEventListener("error", () => {
      setImageParam("progress", 0, index);
      setCurrentlyImporting(false);
      setImageParam("error", "Failed to import from Google", index);
    });
    imageRequest.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setImageParam(
          "progress",
          Math.round((100 * e.loaded) / (2 * e.total)),
          index
        );
      }
    });
    imageRequest.open(
      "GET",
      "https://www.googleapis.com/drive/v3/files/" +
        newImport["drive_id"] +
        "?alt=media"
    );
    imageRequest.responseType = "blob";
    imageRequest.setRequestHeader("Authorization", "Bearer " + oauthToken);
    const resourceKey = newImport["resourceKey"]
    if (resourceKey) {
      imageRequest.setRequestHeader("X-Goog-Drive-Resource-Keys", `${newImport["drive_id"]/resourceKey}`);
    }
    imageRequest.send();
  }

  function uploadToWagtail(imageFile, newImport, index) {
    let formData = new FormData();
    formData.append("drive_id", newImport["drive_id"]);
    formData.append("wagtail_id", newImport["wagtail_id"]);
    formData.append("action", newImport["action"]);
    formData.append("name", newImport["name"]);
    formData.append("collection", props.collection);
    formData.append("image_file", imageFile);
    var request = new XMLHttpRequest();
    request.addEventListener("load", async (e) => {
      let res = await request.response;
      res = JSON.parse(res);
      setImageParam("imported", true, index);
      setCurrentlyImporting(false);
      setImageParam("error", res["error"], index);
      setImageParam("form", res["form"], index);
      setImageParam("edit_action", res["edit_action"], index);
      setImageParam("delete_action", res["delete_action"], index);
      setImageParam("progress", 100, index);
    });
    request.addEventListener("error", async (e) => {
      setCurrentlyImporting(false);
      setImageParam("error", "Failed to upload to Wagtail", index);
    });
    request.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setImageParam(
          "progress",
          Math.round(50 + (100 * e.loaded) / (2 * e.total)),
          index
        );
      }
    });
    request.open("POST", window.location);
    request.setRequestHeader("X-CSRFToken", props.csrfToken);
    request.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    request.send(formData);
  }

  React.useEffect(() => {
    // start import if not currently importing
    if (!currentlyImporting) {
      const nextImportIndex = imageImports.findIndex(
        (imageImport) => !imageImport["error"] && !imageImport["imported"]
      );
      const nextImport = imageImports[nextImportIndex];
      if (nextImport) {
        startImport(nextImport, nextImportIndex);
      }
    }
  }, [currentlyImporting]);

  function getDisplay(imageImport, index) {
    if (imageImport.finished) {
      return null;
    }
    return (
      <ImageImportDisplay
        key={imageImport.id}
        imageImport={imageImport}
        onFormResponseError={(res) => {
          setImageParam("error", res["error"], index);
          setImageParam("form", res["form"], index);
          setImageParam("edit_action", res["edit_action"], index);
          setImageParam("delete_action", res["delete_action"], index);
        }}
        onFormResponseSuccess={(res) => {
          setImageParam("finished", true, index);
          setImageParam("error", res["error"], index);
          setImageParam("form", res["form"], index);
          setImageParam("edit_action", res["edit_action"], index);
          setImageParam("delete_action", res["delete_action"], index);
        }}
        onDeleteResponseLoad={(res) => {
          setImageParam("finished", true, index);
          setImageParam("error", res["error"], index);
          setImageParam("form", res["form"], index);
          setImageParam("edit_action", res["edit_action"], index);
          setImageParam("delete_action", res["delete_action"], index);
        }}
        csrfToken={props.csrfToken}
        tagitOpts={props.tagitOpts}
      />
    );
  }

  const overallProgress = imageImports.reduce((total, imageImport) => {
    return total + imageImport.progress / imageImports.length;
  }, 0);

  const imageList = imageImports.map(getDisplay);

  return (
    <div class="nice-padding">
      <h2>Image import</h2>
      <div
        id="overall-progress"
        aria-valuenow={Math.round(overallProgress)}
        class="progress progress-secondary active"
      >
        <div class="bar" style={{ width: overallProgress + "%" }}>
          {Math.round(overallProgress) + "%"}
        </div>
      </div>
      {imageList.filter((value) => {
        return value !== null;
      }).length > 0 ? (
        <ul id="upload-list" class="upload-list multiple">
          {imageList}
        </ul>
      ) : null}
      {overallProgress === 100 ? (
        <a href={props.indexUrl} class="button button-return">
          Return to image index
        </a>
      ): null}
    </div>
  );
}

function ImageImportDisplay(props) {
  return (
    <li class="row upload-uploading">
      <div class="left col3">
        <div class="preview">
          <div class="thumb icon icon-image hasthumb">
            <img src={props.imageImport.thumbnail} />
          </div>
          {props.imageImport.imported ? null : (
            <div class="progress active">
              <div
                class="bar"
                style={{ width: props.imageImport.progress + "%" }}
              >
                {props.imageImport.progress}%
              </div>
            </div>
          )}
        </div>
      </div>
      <div class="right col9">
        <p>{props.imageImport.name}</p>
        <p
          class={
            props.imageImport.error
              ? "status-msg failure"
              : "status-msg success"
          }
        >
          {props.imageImport.error || !props.imageImport.imported
            ? props.imageImport.error
            : "Image successfully imported. Please update this image with a more appropriate title, if necessary. You may also delete the image completely if the import wasn't required."}
        </p>
        {props.imageImport.form ? (
          <ImportUpdateForm
            imageImport={props.imageImport}
            onFormResponseError={props.onFormResponseError}
            onFormResponseSuccess={props.onFormResponseSuccess}
            onDeleteResponseLoad={props.onDeleteResponseLoad}
            csrfToken={props.csrfToken}
            tagitOpts={props.tagitOpts}
          />
        ) : null}
      </div>
    </li>
  );
}

function ImportUpdateForm(props) {
  const updateForm = React.useRef(null);

  React.useLayoutEffect(() => {
    // initialise tag fields
    if (updateForm.current) {
      const field = $(".tag_field input", updateForm.current);
      if (field) {
        field.tagit(props.tagitOpts);
        return () => {
          field.tagit("destroy");
        };
      }
    }
  }, [props.imageImport.form]);

  function submitForm(e) {
    e.preventDefault();
    var request = new XMLHttpRequest();
    request.addEventListener("load", async (e) => {
      e.preventDefault();
      res = await request.response;
      res = JSON.parse(res);
      if (res["error"]) {
        props.onFormResponseError(res);
      } else {
        props.onFormResponseSuccess(res);
      }
    });
    request.open("POST", props.imageImport.edit_action);
    request.setRequestHeader("X-CSRFToken", props.csrfToken);
    request.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    request.send(new FormData(e.target));
  }
  function deleteImage(e) {
    e.preventDefault();
    var request = new XMLHttpRequest();
    request.addEventListener("load", async (e) => {
      e.preventDefault();
      res = await request.response;
      res = JSON.parse(res);
      props.onDeleteResponseLoad(res);
    });
    request.open("POST", props.imageImport.delete_action);
    request.setRequestHeader("X-CSRFToken", props.csrfToken);
    request.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    request.send();
  }
  return (
    <form
      method="POST"
      enctype="multipart/form-data"
      novalidate
      ref={updateForm}
      onSubmit={submitForm}
    >
      <ul
        class="fields"
        dangerouslySetInnerHTML={{ __html: props.imageImport.form }}
      />
      <ul class="fields">
        <li>
          <input
            type="hidden"
            name="drive_id"
            value={props.imageImport.driveId}
          />
          <input type="submit" value="Update" class="button" />
          <button
            type="button"
            class="delete button button-secondary no"
            onClick={deleteImage}
          >
            Delete
          </button>
        </li>
      </ul>
    </form>
  );
}

function DuplicateIdentifier(props) {
  const [potentialDuplicates, setPotentialDuplicates] = React.useState({});
  const [duplicateActions, setDuplicateActions] = React.useState({});
  React.useEffect(() => {
    // query potential duplicates in Wagtail
    const data = JSON.stringify(props.imageData);
    fetch(props.duplicateReviewUrl, {
      method: "post",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
      body: data,
    })
      .then((res) => {
        if (res.ok) {
          res.json().then((res_json) => {
            setPotentialDuplicates(res_json);
            props.onGetDuplicateData(res_json);
            let duplicateIds = Object.keys(res_json);
            // set default actions
            let actions = {};
            for (let index = 0; index < duplicateIds.length; index++) {
              actions[duplicateIds[index]] = "replace";
            }
            setDuplicateActions(actions);
            // if no duplicates, confirm no actions without needing confirmation button click
            if (duplicateIds.length == 0) {
              props.onConfirmDuplicateActions({});
            }
          });
        } else {
          console.error(res);
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }, [props.selectedImageData]);

  if (potentialDuplicates && Object.keys(potentialDuplicates).length > 0) {
    let globalAction = true;
    getGlobalAction = () => {
      // if the action chosen for all duplicates is the same, returns the action, otherwise null
      if (!globalAction) {
        return null;
      }
      return duplicateActions[Object.keys(duplicateActions)[0]];
    };
    setGlobalAction = (newAction) => {
      // sets the action for all duplicates to newAction
      let newActions = {};
      const ids = Object.keys(duplicateActions);
      for (let index = 0; index < ids.length; index++) {
        newActions[ids[index]] = newAction;
      }
      setDuplicateActions(newActions);
    };
    let duplicateComparisons = [];
    let pastAction = null;
    let action = null;
    const imageDataIterator = props.imageData.entries();
    for (const [index, value] of imageDataIterator) {
      const id = value["id"];
      if (id in potentialDuplicates) {
        action = duplicateActions[id];
        if (globalAction && !(pastAction === null) && !(action == pastAction)) {
          // if the action is not the same as the previous action, not all actions are the same
          globalAction = false;
        }
        const wagtailDuplicate = potentialDuplicates[id];
        const driveDuplicate = value;
        duplicateComparisons.push(
          <tr>
            <td>
              <DuplicateComparison
                driveDuplicate={driveDuplicate}
                wagtailDuplicate={wagtailDuplicate}
              />
            </td>
            <DuplicateChoice
              action={action}
              onClick={(e) => {
                let actions = { ...duplicateActions };
                actions[id] = e.target.value;
                setDuplicateActions(actions);
              }}
            />
          </tr>
        );
        pastAction = action;
      }
    }
    return (
      <React.Fragment>
        <div class="nice-padding">
          <h2 class="icon icon-warning">Duplicates detected</h2>
          <p>
            Wagtail has detected images similar to the ones you have just chosen
            to upload
          </p>
          <p>Please choose how you would like to proceed</p>
          <p>
            <b>{Object.keys(potentialDuplicates).length} duplicates detected</b>
          </p>
          <table class="listing">
            <thead>
              <tr class="table-headers">
                <th></th>
                <th>Replace original image</th>
                <th>Keep both images</th>
                <th>Cancel upload</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td></td>
                <DuplicateChoice
                  action={getGlobalAction()}
                  onClick={(e) => {
                    setGlobalAction(e.target.value);
                  }}
                />
              </tr>
              {duplicateComparisons}
            </tbody>
          </table>
        </div>
        <footer>
          <ul>
            <li class="actions">
              <button
                type="submit"
                class="button"
                onClick={() =>
                  props.onConfirmDuplicateActions(duplicateActions)
                }
              >
                Confirm all
              </button>
            </li>
          </ul>
        </footer>
      </React.Fragment>
    );
  } else {
    return (
      <div class="nice-padding">
        <LoadingSpinner message="Identifying duplicates" />
      </div>
    );
  }
}

function DuplicateChoice(props) {
  return (
    <React.Fragment>
      <td>
        <input
          type="radio"
          value="replace"
          checked={props.action == "replace"}
          onClick={props.onClick}
        ></input>
      </td>
      <td>
        <input
          type="radio"
          value="keep"
          checked={props.action == "keep"}
          onClick={props.onClick}
        ></input>
      </td>
      <td>
        <input
          type="radio"
          value="cancel"
          checked={props.action == "cancel"}
          onClick={props.onClick}
        ></input>
      </td>
    </React.Fragment>
  );
}

function DuplicateComparison(props) {
  return (
    <table class="image-comparison">
      <thead>
        <tr class="image-headings">
          <th>Original</th>
          <th>New</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <img
              src={props.wagtailDuplicate["thumbnail"]}
              width="165"
              height="165"
            />
          </td>
          <td>
            <img
              src={props.driveDuplicate["thumbnailLink"]}
              width="165"
              height="165"
            />
          </td>
        </tr>
        <tr>
          <td>
            <p>
              <b>{props.wagtailDuplicate["title"]}</b>
            </p>
          </td>
          <td>
            <p>
              <b>{props.driveDuplicate["name"]}</b>
            </p>
          </td>
        </tr>
        <tr>
          <td>
            <p>Created at {props.wagtailDuplicate["created_at"]}</p>
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>
  );
}

function DriveSelector(props) {
  const [apiLoaded, setApiLoaded] = React.useState(false);
  React.useEffect(() => {
    // Load auth and picker APIs
    gapi.load("client:auth2:picker", () => {
      gapi.client
        .init({
          apiKey: props.pickerApiKey,
          clientId: props.clientId,
          discoveryDocs: [
            "https://docs.googleapis.com/$discovery/rest?version=v1",
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
          ],
          scope: props.scope,
        })
        .then(() => {
          setApiLoaded(true);
        })
        .catch((error) => {
          console.error(error);
        });
    });
  }, []);

  function authenticate() {
    const googleAuth = gapi.auth2.getAuthInstance();

    if (googleAuth.isSignedIn.get()) {
      return Promise.resolve(googleAuth.currentUser.get().getAuthResponse());
    }

    return googleAuth.signIn({ scope: props.scope }).then((result) => {
      return result.getAuthResponse();
    });
  }

  function showPicker(oauthToken, callback) {
    let docsView = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES);
    docsView.setSelectFolderEnabled(true);
    docsView.setIncludeFolders(true);
    docsView.setParent(props.driveParent);

    let picker = new google.picker.PickerBuilder()
      .setAppId(props.appId)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(props.pickerApiKey)
      .setOAuthToken(oauthToken)
      .addView(docsView)
      .setCallback(callback)
      .build();

    picker.setVisible(true);
  }

  function isImage(element, index, array) {
    return element.type == google.picker.Type.PHOTO;
  }

  function isFolder(element, index, array) {
    return element.type == google.picker.Type.jG;
  }

  async function onSelect(data) {
    if (data.action == google.picker.Action.PICKED) {
      const images = data.docs.filter(isImage);
      const folders = data.docs.filter(isFolder);
      let imageData = new Array();
      if (folders && folders.length) {
        const q = `(mimeType contains 'image/') and (${folders
          .reduce(
            (query, folder) => query + `('${folder.id}' in parents) or `,
            ``
          )
          .slice(0, -4)})`;
        let response = await gapi.client.drive.files.list({
          q: q,
          pageSize: 1000,
          fields:
            "nextPageToken, files(id, name, thumbnailLink, fileExtension, md5Checksum, size, imageMediaMetadata, resourceKey)",
        });
        imageData.push(...response.result.files);
      }
      if (images && images.length) {
        for (let index = 0; index < images.length; index++) {
          let response = await gapi.client.drive.files.get({
            fileId: images[index].id,
            fields:
              "id, name, thumbnailLink, fileExtension, md5Checksum, size, imageMediaMetadata, resourceKey",
          });
          imageData.push(response.result);
        }
      }
      props.onGetImageData(imageData);
    }
  }

  function pick() {
    authenticate().then((auth) => {
      return showPicker(auth.access_token, onSelect);
    });
  }

  if (apiLoaded) {
    return (
      <div class="nice-padding import-selector">
        <button class="button bicolor icon icon-plus" onClick={pick}>
          Select an image or folder in Drive
        </button>
      </div>
    );
  } else {
    return (
      <div class="nice-padding import-selector">
        <LoadingSpinner message="Loading Google API" />
      </div>
    );
  }
}

const LoadingSpinner = (props) => (
  <span>
    <Icon name="spinner" className="c-spinner" />
    {props.message}
  </span>
);

const domContainer = document.querySelector("#importer");
ReactDOM.render(
  <Importer
    appId={domContainer.dataset.appId}
    pickerApiKey={domContainer.dataset.pickerApiKey}
    clientId={domContainer.dataset.clientId}
    duplicateReviewUrl={domContainer.dataset.duplicateReviewUrl}
    csrfToken={document.querySelector("[name=csrfmiddlewaretoken]").value}
    collections={JSON.parse(domContainer.dataset.collections)}
    tagitOpts={{
      autocomplete: { source: domContainer.dataset.autocompleteUrl },
    }}
    driveParent={domContainer.dataset.driveParent}
    indexUrl={domContainer.dataset.indexUrl}
  />,
  domContainer
);
