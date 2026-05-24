export const exampleParsedDiagram = {
  component: {
    name: 'Form',
    pos: { line: 3, column: 1 },
    exportName: 'default',
    declarationKind: 'function'
  },
  stateVariables: [
    {
      id: 'state:answer:4:10',
      hook: 'useState',
      name: 'answer',
      setterName: 'setAnswer',
      initializerText: "''",
      typeText: 'string',
      pos: { line: 4, column: 10 },
      states: [
        {
          id: 'update:answer:expression:e.target.value:26:5',    
          nodeType: 'state-update',
          stateVariableId: 'state:answer:4:10',
          setterName: 'setAnswer',
          kind: 'expression',
          pos: { line: 26, column: 5 },
          label: 'e.target.value'
        }
      ],
      mutators: [
        {
          id: 'mutator:answer:handleTextareaChange:25:3',        
          name: 'handleTextareaChange',
          pos: { line: 25, column: 3 },
          type: 'function',
          nodes: [
            {
              id: 'update:answer:expression:e.target.value:26:5',
              nodeType: 'state-update',
              stateVariableId: 'state:answer:4:10',
              setterName: 'setAnswer',
              kind: 'expression',
              pos: { line: 26, column: 5 },
              label: 'e.target.value'
            },
            {
              id: 'flow:entry:handleTextareaChange:25:36',       
              nodeType: 'control-flow',
              kind: 'entry',
              label: 'handleTextareaChange',
              pos: { line: 25, column: 36 }
            },
            {
              id: 'flow:exit:return:25:36',
              nodeType: 'control-flow',
              kind: 'exit',
              label: 'return',
              pos: { line: 25, column: 36 }
            }
          ],
          transitions: [
            {
              id: 'transition:flow:entry:handleTextareaChange:25:36->update:answer:expression:e.target.value:26:5:normal:25:36',
              fromNodeId: 'flow:entry:handleTextareaChange:25:36',
              toNodeId: 'update:answer:expression:e.target.value:26:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: 'transition:update:answer:expression:e.target.value:26:5->flow:exit:return:25:36:normal:26:5',
              fromNodeId: 'update:answer:expression:e.target.value:26:5',
              toNodeId: 'flow:exit:return:25:36',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            }
          ]
        }
      ]
    },
    {
      id: 'state:error:5:10',
      hook: 'useState',
      name: 'error',
      setterName: 'setError',
      initializerText: 'null',
      typeText: 'null',
      pos: { line: 5, column: 10 },
      states: [
        {
          id: 'update:error:expression:err:21:7',
          nodeType: 'state-update',
          stateVariableId: 'state:error:5:10',
          setterName: 'setError',
          kind: 'expression',
          pos: { line: 21, column: 7 },
          label: 'err'
        }
      ],
      mutators: [
        {
          id: 'mutator:error:handleSubmit:13:3',
          name: 'handleSubmit',
          pos: { line: 13, column: 3 },
          type: 'function',
          nodes: [
            {
              id: 'update:error:expression:err:21:7',
              nodeType: 'state-update',
              stateVariableId: 'state:error:5:10',
              setterName: 'setError',
              kind: 'expression',
              pos: { line: 21, column: 7 },
              label: 'err'
            },
            {
              id: 'flow:entry:handleSubmit:13:34',
              nodeType: 'control-flow',
              kind: 'entry',
              label: 'handleSubmit',
              pos: { line: 13, column: 34 }
            },
            {
              id: 'flow:decision:try:16:5',
              nodeType: 'control-flow',
              kind: 'decision',
              label: 'try',
              pos: { line: 16, column: 5 }
            },
            {
              id: 'flow:merge::16:5',
              nodeType: 'control-flow',
              kind: 'merge',
              label: undefined,
              pos: { line: 16, column: 5 }
            },
            {
              id: 'flow:exit:return:13:34',
              nodeType: 'control-flow',
              kind: 'exit',
              label: 'return',
              pos: { line: 13, column: 34 }
            }
          ],
          transitions: [
            {
              id: 'transition:flow:entry:handleSubmit:13:34->flow:decision:try:16:5:normal:13:34',
              fromNodeId: 'flow:entry:handleSubmit:13:34',
              toNodeId: 'flow:decision:try:16:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: 'transition:flow:decision:try:16:5->update:error:expression:err:21:7:catch:16:5',
              fromNodeId: 'flow:decision:try:16:5',
              toNodeId: 'update:error:expression:err:21:7',
              kind: 'catch',
              label: '[catch] err',
              rawConditionText: 'err'
            },
            {
              id: 'transition:flow:decision:try:16:5->flow:merge::16:5:normal:16:5',
              fromNodeId: 'flow:decision:try:16:5',
              toNodeId: 'flow:merge::16:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: 'transition:update:error:expression:err:21:7->flow:merge::16:5:normal:21:7',
              fromNodeId: 'update:error:expression:err:21:7',
              toNodeId: 'flow:merge::16:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: 'transition:flow:merge::16:5->flow:exit:return:13:34:normal:16:5',
              fromNodeId: 'flow:merge::16:5',
              toNodeId: 'flow:exit:return:13:34',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            }
          ]
        }
      ]
    },
    {
      id: 'state:status:6:10',
      hook: 'useState',
      name: 'status',
      setterName: 'setStatus',
      initializerText: "'typing'",
      typeText: 'string',
      pos: { line: 6, column: 10 },
      states: [
        {
          id: "update:status:direct:'submitting':15:5",
          nodeType: 'state-update',
          stateVariableId: 'state:status:6:10',
          setterName: 'setStatus',
          kind: 'direct',
          pos: { line: 15, column: 5 },
          label: "'submitting'"
        },
        {
          id: "update:status:direct:'success':18:7",
          nodeType: 'state-update',
          stateVariableId: 'state:status:6:10',
          setterName: 'setStatus',
          kind: 'direct',
          pos: { line: 18, column: 7 },
          label: "'success'"
        },
        {
          id: "update:status:direct:'typing':20:7",
          nodeType: 'state-update',
          stateVariableId: 'state:status:6:10',
          setterName: 'setStatus',
          kind: 'direct',
          pos: { line: 20, column: 7 },
          label: "'typing'"
        }
      ],
      mutators: [
        {
          id: 'mutator:status:handleSubmit:13:3',
          name: 'handleSubmit',
          pos: { line: 13, column: 3 },
          type: 'function',
          nodes: [
            {
              id: "update:status:direct:'submitting':15:5",
              nodeType: 'state-update',
              stateVariableId: 'state:status:6:10',
              setterName: 'setStatus',
              kind: 'direct',
              pos: { line: 15, column: 5 },
              label: "'submitting'"
            },
            {
              id: "update:status:direct:'success':18:7",
              nodeType: 'state-update',
              stateVariableId: 'state:status:6:10',
              setterName: 'setStatus',
              kind: 'direct',
              pos: { line: 18, column: 7 },
              label: "'success'"
            },
            {
              id: "update:status:direct:'typing':20:7",
              nodeType: 'state-update',
              stateVariableId: 'state:status:6:10',
              setterName: 'setStatus',
              kind: 'direct',
              pos: { line: 20, column: 7 },
              label: "'typing'"
            },
            {
              id: 'flow:entry:handleSubmit:13:34',
              nodeType: 'control-flow',
              kind: 'entry',
              label: 'handleSubmit',
              pos: { line: 13, column: 34 }
            },
            {
              id: 'flow:decision:try:16:5',
              nodeType: 'control-flow',
              kind: 'decision',
              label: 'try',
              pos: { line: 16, column: 5 }
            },
            {
              id: 'flow:merge::16:5',
              nodeType: 'control-flow',
              kind: 'merge',
              label: undefined,
              pos: { line: 16, column: 5 }
            },
            {
              id: 'flow:exit:return:13:34',
              nodeType: 'control-flow',
              kind: 'exit',
              label: 'return',
              pos: { line: 13, column: 34 }
            }
          ],
          transitions: [
            {
              id: "transition:flow:entry:handleSubmit:13:34->update:status:direct:'submitting':15:5:normal:13:34",
              fromNodeId: 'flow:entry:handleSubmit:13:34',
              toNodeId: "update:status:direct:'submitting':15:5",
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: "transition:update:status:direct:'submitting':15:5->flow:decision:try:16:5:normal:15:5",
              fromNodeId: "update:status:direct:'submitting':15:5",
              toNodeId: 'flow:decision:try:16:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: "transition:flow:decision:try:16:5->update:status:direct:'success':18:7:normal:16:5",
              fromNodeId: 'flow:decision:try:16:5',
              toNodeId: "update:status:direct:'success':18:7",
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: "transition:flow:decision:try:16:5->update:status:direct:'typing':20:7:catch:16:5",
              fromNodeId: 'flow:decision:try:16:5',
              toNodeId: "update:status:direct:'typing':20:7",
              kind: 'catch',
              label: '[catch] err',
              rawConditionText: 'err'
            },
            {
              id: "transition:update:status:direct:'success':18:7->flow:merge::16:5:normal:18:7",
              fromNodeId: "update:status:direct:'success':18:7",
              toNodeId: 'flow:merge::16:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: "transition:update:status:direct:'typing':20:7->flow:merge::16:5:normal:20:7",
              fromNodeId: "update:status:direct:'typing':20:7",
              toNodeId: 'flow:merge::16:5',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            },
            {
              id: 'transition:flow:merge::16:5->flow:exit:return:13:34:normal:16:5',
              fromNodeId: 'flow:merge::16:5',
              toNodeId: 'flow:exit:return:13:34',
              kind: 'normal',
              label: 'normal',
              rawConditionText: undefined
            }
          ]
        }
      ]
    }
  ]
}