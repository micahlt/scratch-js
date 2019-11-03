import 'https://unpkg.com/jszip/dist/jszip.min.js'
import { compile } from '../scratch-js/compiler/index.mjs'

const fileSelector = document.querySelector('#project-file')
const downloadLink = document.querySelector('#download-link')

fileSelector.addEventListener('change', async function() {
  console.log(this.files)
  
  const projectZip = await JSZip.loadAsync(this.files[0])
  const json = await projectZip.file('project.json').async('string').then(JSON.parse)

  const filenameToBlob = fileName => projectZip.file(fileName).async('blob')

  const compiled = await compile(json, filenameToBlob)
  console.log(compiled)

  const resultZip = new JSZip()
  for (const fileName in compiled) {
    if (['index.mjs', 'index.html'].includes(fileName)) {
      resultZip.file(fileName, compiled[fileName])
      continue
    }
    const sprite = compiled[fileName]
    const spriteFolder = resultZip.folder(fileName)
    spriteFolder.file(`${fileName}.mjs`, sprite[`${fileName}.mjs`])
    const costumesFolder = spriteFolder.folder('costumes')
    for (const costumeName in sprite.costumes) {
      const costumeBlob = sprite.costumes[costumeName]
      costumesFolder.file(costumeName, costumeBlob)
    }
  }

  console.log(resultZip)

  const resultZipBlob = await resultZip.generateAsync({ type: 'blob' })
  const resultZipUrl = URL.createObjectURL(resultZipBlob)

  downloadLink.href = resultZipUrl
  downloadLink.download = this.files[0].name.split('.').slice(0, -1).join('.')
  downloadLink.style.display = 'block'
})
