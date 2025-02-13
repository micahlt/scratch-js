import { Project } from '../scratch-js/index.mjs'

import Stage from './Stage/Stage.mjs'
import Dog from './Dog/Dog.mjs'
import Cat from './Cat/Cat.mjs'

const stage = new Stage({
  costumeNumber: 1
})

const sprites = [
  new Cat({
    x: -100,
    y: 0,
    direction: 90,
    costumeNumber: 1,
    size: 100,
    visible: true,
    penDown: true
  }),
  new Dog({
    x: 100,
    y: 0,
    direction: 45,
    costumeNumber: 1,
    size: 100,
    visible: true
  })
]

const project = new Project(stage, sprites)

project.run()