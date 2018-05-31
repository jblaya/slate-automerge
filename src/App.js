import React from 'react'
import Immutable from "immutable";
import { Editor } from 'slate-react'
import { Value, Block } from 'slate'
import diff from './intelie_diff/diff'
import customToJSON from "./utils/customToJson"
import { applyImmutableDiffOperations } from "./utils/immutableDiffToAutomerge"
import { applySlateOperations } from "./utils/slateOpsToAutomerge"
import { convertAutomergeToSlateOps } from "./utils/convertAutomergeToSlateOps"
import slateDiff from 'slate-diff'
import Automerge from 'automerge'

var path = require('./intelie_diff/path');
var concatPath = path.concat,
                  escape = path.escape;

const initialValue = Value.fromJSON({
  document: {
    nodes: [
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'A line of text in a paragraph.'
              }
            ]
          }
        ]
      },
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'Another line of text'
              }
            ]
          }
        ]
      },
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'Yet another line of text'
              }
            ]
          }
        ]
      }
    ]
  }
})

const initialValue2 = Value.fromJSON({
  document: {
    nodes: [
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'A line of text in a paragraph.'
              }
            ]
          }
        ]
      },
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'Another line of text'
              }
            ]
          }
        ]
      },
      {
        object: 'block',
        type: 'paragraph',
        nodes: [
          {
            object: 'text',
            leaves: [
              {
                text: 'Yet another line of text'
              }
            ]
          }
        ]
      }
    ]
  }
})

const SUPPORTED_SLATE_SET_OBJECTS = [
  'document',
  'block',
  'text',
  'character'
]

const SUPPORTED_SLATE_PATH_OBJECTS = [
  'nodes',
  'characters'
]

// let doc1 = Automerge.initImmutable();
// let doc2 = Automerge.initImmutable();
let doc1 = Automerge.init();
let doc2 = Automerge.init();

class App extends React.Component {

    constructor(props) {
      super(props)

      this.reflectDiff = this.reflectDiff.bind(this)
      this.reflectDiff2 = this.reflectDiff2.bind(this)

      this.onChange1 = this.onChange1.bind(this)
      this.onChange2 = this.onChange2.bind(this)

      this.buildObjectIdMap = this.buildObjectIdMap.bind(this)

      this.state = {
        value: initialValue,
        value2: initialValue2,
        pathMap: {},
        online: true,
        doc1OfflineHistory: Immutable.List(),
        doc2OfflineHistory: Immutable.List(),
      }
    }

    componentDidMount = () => {
      console.log(customToJSON(this.state.value.document))
      doc1 = Automerge.change(doc1, 'Initialize Slate state', doc => {
        doc.note = customToJSON(this.state.value.document);
      })
      ///
      doc2 = Automerge.merge(doc2, doc1)
      ///
      this.buildObjectIdMap()
    }

    onChange1 = ({ operations, value }) => {

      var differences = diff(this.state.value.document, value.document);

      this.setState({ value: value })

      if (differences.size > 0) {

        // Using the difference obtained from the Immutable diff library,
        // apply the operations to the Automerge document.
        const doc1b = Automerge.change(doc1, 'Editor1 change', doc => {
          applyImmutableDiffOperations(doc, differences)
          // applySlateOperations(doc, operations)
        })

        // Update doc2 changes
        const changes = Automerge.getChanges(doc1, doc1b)
        console.log(changes)
        // doc2 = Automerge.applyChanges(doc2, changes)

        // Update doc1
        doc1 = doc1b
        if (this.state.online) {
          this.applyDiffToDoc2(changes);
        } else {
          this.setState({
            doc1OfflineHistory: this.state.doc1OfflineHistory.push(changes)
          })
        }
      }
    }

    onChange2 = ({ operations, value }) => {

      var differences = diff(this.state.value2.document, value.document);

      this.setState({ value2: value })

      if (differences.size > 0) {
        const doc2b = Automerge.change(doc2, 'Editor2 change', doc => {
          applyImmutableDiffOperations(doc, differences)
          // applySlateOperations(doc, operations)
        })

        // Update doc1 changes
        const changes = Automerge.getChanges(doc2, doc2b)
        console.log(changes)
        // doc1 = Automerge.applyChanges(doc1, changes)

        // Update doc2
        doc2 = doc2b
        if (this.state.online) {
          this.applyDiffToDoc1(changes);
        } else {
          this.setState({
            doc2OfflineHistory: this.state.doc2OfflineHistory.push(changes)
          })
        }
      }
    }

    // FIXME: Unexpected behavior for the following scenarios:
    //   Merge nodes and immediately insert text
    //     Expected: Proper merge and text insert
    //     Actual: Inserted text overwrites some chars in merged node
    //     Probably because merge node is equal to delete entire nodes
    //     and re-insert with new text
    reflectDiff = () => {
      let changesTotal1 = [];
      this.state.doc1OfflineHistory.forEach((changes) => {
        changesTotal1 = changesTotal1.concat(changes)
      })

      this.applyDiffToDoc2(changesTotal1);

      let changesTotal2 = [];
      this.state.doc2OfflineHistory.forEach((changes) => {
        changesTotal2 = changesTotal2.concat(changes)
      })

      this.applyDiffToDoc1(changesTotal2);

      this.setState({
        doc1OfflineHistory: Immutable.List(),
        doc2OfflineHistory: Immutable.List(),
      })
    }

    reflectDiff2 = () => {
      const doc1new = Automerge.merge(doc1, doc2)
      const doc2new = Automerge.merge(doc2, doc1new)

      const changes1 = Automerge.getChanges(doc1, doc1new)
      const changes2 = Automerge.getChanges(doc2, doc2new)

      this.applyDiffToDoc1(changes1)
      this.applyDiffToDoc2(changes2)
    }

    applyDiffToDoc1 = (changes) => {

      // Update the Automerge document
      const doc1new = Automerge.applyChanges(doc1, changes)
      const opSetDiff = Automerge.diff(doc1, doc1new)

      // Convert the changes from the Automerge document to Slate operations
      const slateOps = convertAutomergeToSlateOps(opSetDiff, this.state.pathMap, this.state.value)
      console.log('slateOps: ', slateOps)
      const change = this.state.value.change()
      change.applyOperations(slateOps)
      this.setState({ value: change.value })

      doc1 = doc1new;

      // Paths may have changed after applying operations - update objectId map
      // TODO: only change those values that changed
      this.buildObjectIdMap()
    }

    applyDiffToDoc2 = (changes) => {

      // Update the Automerge document
      const doc2new = Automerge.applyChanges(doc2, changes)
      const opSetDiff = Automerge.diff(doc2, doc2new)

      // Convert the changes from the Automerge document to Slate operations
      const slateOps = convertAutomergeToSlateOps(opSetDiff, this.state.pathMap, this.state.value2)
      console.log('slateOps: ', slateOps)
      const change = this.state.value2.change()
      change.applyOperations(slateOps)
      this.setState({ value2: change.value })

      doc2 = doc2new;

      // Paths may have changed after applying operations - update objectId map
      // TODO: only change those values that changed
      this.buildObjectIdMap()
    }

    buildObjectIdMap = () => {
      const history = Automerge.getHistory(doc1)
      const snapshot = history[history.length - 1].snapshot.note

      this.setState({pathMap: this.deepTraverse(snapshot, null, {}) })
    }

    deepTraverse = (obj, p, pathMap) => {
      let path = p || ''
      const isList = obj instanceof Array

      // Iterate object keys instead
      if (!isList) {
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (SUPPORTED_SLATE_PATH_OBJECTS.includes(key)) {
              // console.log("key: ", key)
              // console.log("value: ", obj[key])
              // console.log("path: ", concatPath(path, escape(key)))
              const thisPath = concatPath(path, escape(key))
              pathMap[obj[key]._objectId] = thisPath
              this.deepTraverse(obj[key], thisPath, pathMap)
            }
          }
        }
      }
      else {
        // Assumed to be a list
        obj.forEach((value, key) => {
          // console.log("value: ", value)
          // console.log("path: ", concatPath(path, escape(key)))
          const thisPath = concatPath(path, escape(key))
          pathMap[value._objectId] = thisPath
          this.deepTraverse(value, thisPath, pathMap)
        });
      }

      return pathMap
    }

    /////////////////////////////
    toggleOnline = () => {
      this.setState({online: !this.state.online});
    }

    render = () => {
        let onlineText;
        let toggleButtonText;
        if (this.state.online) {
          onlineText = "CURRENTLY LIVE SYNCING"
          toggleButtonText = "Toggle offline mode"
        } else {
          onlineText = "CURRENTLY OFFLINE"
          toggleButtonText = "Toggle online mode"
        }

        return (
          <div>
            <div>{onlineText}</div>
            <hr></hr>
            <Editor
                value={this.state.value}
                onChange={this.onChange1}
            />
            <hr></hr>
            <Editor
                value={this.state.value2}
                onChange={this.onChange2}
            />
            <hr></hr>
            <button onClick={this.toggleOnline}>{toggleButtonText}</button>
            {!this.state.online &&
              <button onClick={this.reflectDiff2}>Sync off-line mode</button>
            }
          </div>
        )
    }

}

export default App
