const config = {
  scratchJsImport: 'https://pulljosh.github.io/scratch-js/scratch-js/index.mjs'
}

function uniqueName(goalName, existingNames) {
  if (existingNames.includes(goalName)) {
    const numResult = (/\d+$/).exec(goalName)
    if (numResult === null) {
      return uniqueName(goalName + '2', existingNames)
    }
    return uniqueName(goalName.slice(0, numResult.index) + (parseInt(numResult[0], 10) + 1), existingNames)
  }
  return goalName
}

function unindent(strings, ...values) {
  let str = ''
  for (let i = 0; i < strings.length; i++) {
    str += strings[i]
    if (i < values.length) {
      str += values[i]
    }
  }

  const lines = str.split('\n')

  const indentLevel = str => {
    for (let i = 0; i < str.length; i++) {
      if (str[i] !== ' ') return i
    }
    return null
  }
  const minIndent = Math.min(...lines.map(indentLevel).filter(n => n !== null))

  return lines.map(line => line.slice(minIndent)).join('\n')
}

function scriptToString(script, indentLevel = 0) {
  const indent = ' '.repeat(indentLevel)
  return script.map(blockToString).join('\n').split('\n').map(line => indent + line).join('\n')
}

function expressionToString(expression, indentLevel = 0) {
  switch (expression.type) {
    case 'script':
      return scriptToString(expression.value, indentLevel)
    case 'block':
      return blockToString(expression.value)
    case 'number':
      return expression.value.toString()
    case 'string':
      return JSON.stringify(expression.value)
    case 'variable':
      if (expression.value.global) {
        return `g.get("${expression.value.name}")`
      }
      return `s.get("${expression.value.name}")`
  }
}

function blockToString(block) {
  const { id, inputs, fields } = block
  switch (id) {
    case 'control_forever':
      return `while (true) {\n${expressionToString(inputs.SUBSTACK, 2)}\n  yield\n}`
    case 'control_if':
        return `if (${expressionToString(inputs.CONDITION)}) {\n${expressionToString(inputs.SUBSTACK, 2)}\n}`
    case 'control_if_else':
      return `if (${expressionToString(inputs.CONDITION)}) {\n${expressionToString(inputs.SUBSTACK, 2)}\n} else {\n${scriptToString(inputs.SUBSTACK2.value, 2)}\n}`
    case 'sensing_askandwait':
      return `prompt(${expressionToString(inputs.QUESTION)})`
    case 'operator_multiply':
      return `${expressionToString(inputs.NUM1)} * ${expressionToString(inputs.NUM2)}`
    case 'operator_random':
      return `this.random(${expressionToString(inputs.FROM)}, ${expressionToString(inputs.TO)})`
    case 'operator_equals':
      return `${expressionToString(inputs.OPERAND1)} == ${expressionToString(inputs.OPERAND2)}`
    case 'operator_join':
      return `"" + ${expressionToString(inputs.STRING1)} + ${expressionToString(inputs.STRING2)}`
    case 'data_setvariableto':
      if (fields.VARIABLE.value.global) {
        return `g.set("${fields.VARIABLE.value.name}", ${expressionToString(inputs.VALUE)})`
      }
      return `s.set("${fields.VARIABLE.value.name}", ${expressionToString(inputs.VALUE)})`
  }
  return `/* TODO: Block ${id} not yet implemented */`
}

function targetToJavascript(target) {
  return unindent`
    import { ${target.isStage ? 'Stage as StageBase' : 'Sprite'}, Costume, Trigger } from '${config.scratchJsImport}'

${target.costumes.map(costume =>
`    import ${costume.name} from './costumes/${costume.filename}'`
).join('\n')}

    export default class ${target.name} extends ${target.isStage ? 'StageBase' : 'Sprite'} {
      constructor(...args) {
        super(...args)

        this.costumes = [
${target.costumes.map(costume =>
`          new Costume('${costume.name}', ${costume.name}, { x: ${costume.center.x}, y: ${costume.center.y} })`
).join(',\n')}
        ]

        this.triggers = [
${target.scripts.map(({ name, trigger }) => {
  return `          new Trigger(Trigger.${trigger.id}, ${trigger.options === null ? '' : '{}, '}this.${name}.bind(this))`
}).join(',\n')}
        ]
      }

${target.scripts.map(({ name, script }) => 
`      * ${name}(g, s) {
${scriptToString(script, 8)}
      }`
)}
    }`
}

export async function compile(json, filenameToBlob) {
  let sprites = []

  const targetsStageFirst = json.targets.sort(target => target.isStage ? -1 : 1)
  let globalVariables = []

  for (const target of targetsStageFirst) {
    let usedNames = globalVariables.map(v => v.name)

    const variables = []
    for (const [id, [name, value]] of Object.entries(target.variables)) {
      const newName = uniqueName(name, usedNames)
      variables.push({
        id,
        name: newName,
        value,
        global: target.isStage
      })
      usedNames.push(newName)
    }

    if (target.isStage) {
      globalVariables = variables
    }

    const costumes = []
    for (const backdrop of target.costumes) {
      const name = uniqueName(backdrop.name, usedNames)
      costumes.push({
        name,
        filename: `${name}.${backdrop.dataFormat}`,
        sourceFile: backdrop.md5ext,
        center: {
          x: backdrop.rotationCenterX,
          y: backdrop.rotationCenterY
        }
      })
      usedNames.push(name)
    }

    const sounds = []
    for (const sound of target.sounds) {
      const name = uniqueName(sound.name, usedNames)
      sounds.push({
        name,
        filename: `${name}.${sound.dataFormat}`,
        sourceFile: sound.md5ext
      })
      usedNames.push(name)
    }

    const triggerIdMap = {
      event_whenflagclicked: 'GREEN_FLAG'
    }
    const scriptNameMap = {
      event_whenflagclicked: 'greenFlag'
    }

    const getScript = firstId => {
      if (firstId === null) return []

      const getValue = ([code, value, id]) => {
        switch (code) {
          case 1:
            return getValue(value)
          case 2:
            return { type: 'script', value: getScript(value) }
          case 3:
            if (typeof value === 'string') return { type: 'block', value: getScript(value)[0] }
            return getValue(value)
          case 4:
          case 5:
            return { type: 'number', value: parseFloat(value) }
          case 6:
          case 7:
            return { type: 'number', value: parseInt(value, 10) }
          case 8:
            return { type: 'angle', value: parseFloat(value) }
          case 9:
            return { type: 'color', value }
          case 10:
            return { type: 'string', value }
          case 11:
            return { type: 'broadcast', value: { id } }
          case 12:
            return {
              type: 'variable',
              value: [...variables, ...globalVariables].find(({ id: varId }) => varId === id)
            }
          case 13:
            return {
              type: 'list',
              value: { id }
            }
        }
      }

      const block = target.blocks[firstId]
      return [
        {
          id: block.opcode,
          inputs: Object.fromEntries(
            Object.entries(block.inputs)
              .map(([name, value]) => ([name, getValue(value)]))
          ),
          fields: Object.fromEntries(
            Object.entries(block.fields)
              .map(([name, value]) => ([name, getValue([12, ...value])]))
          )
        },
        ...getScript(block.next)
      ]
    }

    const scripts = Object.entries(target.blocks)
      .filter(([id, block]) => block.topLevel)
      .map(([id, block]) => {
        const name = uniqueName(scriptNameMap[block.opcode], usedNames)
        usedNames.push(name)
        return {
          name,
          trigger: {
            id: triggerIdMap[block.opcode],
            options: null
          },
          script: getScript(block.next)
        }
      })

    sprites.push({
      name: target.name,
      isStage: target.isStage,
      variables,
      costumes,
      scripts,
      initialConditions: {
        x: target.x,
        y: target.y,
        size: target.size,
        direction: target.direction,
        draggable: target.draggable,
        rotationStyle: target.rotationStyle
      }
    })
  }

  const indexJs = unindent`    import { Project } from '${config.scratchJsImport}'

${sprites.map(({ name }) => `    import ${name} from './${name}/${name}.mjs'`).join('\n')}

    const stage = new Stage({
      costumeNumber: 1
    })

    const sprites = [
${sprites.map(sprite =>
`      new ${sprite.name}(${JSON.stringify(sprite.initialConditions)})`
).join(',\n')}
    ]

    const project = new Project(stage, sprites)
    project.run()
  `

  const indexHtml = unindent`<!doctype html>
    <html>
      <head>
        <title>Example Project</title>
      </head>
      <body>
        <button id="greenFlag">Green Flag</button>
        <div id="project"></div>
    
        <script src="index.mjs" type="module"></script>
      </body>
    </html>
  `

  let result = {}
  for (const sprite of sprites) {
    const folder = {}
    result[sprite.name] = folder

    folder[`${sprite.name}.mjs`] = targetToJavascript(sprite)
    folder['costumes'] = {}

    for (const costume of sprite.costumes) {
      folder['costumes'][costume.filename] = await filenameToBlob(costume.sourceFile)
    }
  }
  result['index.mjs'] = indexJs
  result['index.html'] = indexHtml

  return result
}