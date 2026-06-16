import * as SERVER from '@minecraft/server';
import * as UI from '@minecraft/server-ui';
import { getRandomInt, lerp, offsetLocation, setPermutation, clamp, vec3toString, getRandomFloat, roundTo } from "./utils.js"

SERVER.system.beforeEvents.startup.subscribe(initEvent => {
    initEvent.blockComponentRegistry.registerCustomComponent('vc:graduated_lever', {
        onPlayerInteract: e => {
            const str = e.block.permutation.getState('vc:strength')
            if (e.player?.isSneaking && str > 0) setPermutation(e.block, 'vc:strength', str-1)
            else if (!e.player?.isSneaking && str < 15) setPermutation(e.block, 'vc:strength', str+1)
            e.dimension.playSound('random.click', e.block.center(), {pitch: lerp(0.5, 0.6, (str/15))})
        }
    });
    initEvent.blockComponentRegistry.registerCustomComponent('vc:redstone_link', {
        onBreak: e=> {
            if (e.block.typeId.includes('vc:redstone_link_')) return
            SERVER.system.runTimeout(()=> { //this needs to be delayed for other repair functions to carry out
                //var b = locfrequencies()
                //delete b[vec3toString(e.block.location)]
                //updateLocfreq(b)
            },1)
        },
        beforeOnPlayerPlace: e => {
            SERVER.system.run(()=>{
                e.dimension.playSound("redstone_link.switch.transmitter", e.block.center(), {pitch: getRandomFloat(0.9,1.1)})
                e.dimension.spawnParticle('vc:radar', offsetLocation(e.block.center(), valueBasedOnFacing([
                        {x:(4/16),y:0.7,z:(6.5/16)},
                        {x:(-4/16),y:0.7,z:(-6.5/16)},
                        {x:(-6.5/16),y:0.7,z:(4/16)},
                        {x:(6.5/16),y:0.7,z:(-4/16)},
                        {x:(4/16),y:0,z:(4/16)},
                        {x:(4/16),y:0,z:(-4/16)}
                    ], e.permutationToPlace.getState('minecraft:block_face'))))
            })
        },
        onPlayerInteract: e => {
            const pos = e.faceLocation
            const face = e.block.permutation.getState('minecraft:block_face')
            const frequency = tryGetFrecValue(e.block)
            const isTrans = e.block.typeId == "vc:redstone_link_transmitter"

            const isTopSlot = (face != 'up' && face != 'down') ? (pos.y > 0.5) : face == 'up' ? (pos.z > 0.5) : (pos.z <= 0.5)
            const isInSquare = face == 'east' || face == 'west' ? (pos.z > 0.35 && pos.z < 0.65) : (pos.x > 0.35 && pos.x < 0.65)


            if (isInSquare && e.block.permutation.getState('vc:changing')) {
                //SERVER.world.sendMessage(isTopSlot ? 'Top' : 'Bottom')
                const item = e.player.getComponent("equippable").getEquipment('Mainhand')

                if (isTrans) addGlobalStrength(frequency[0], frequency[1], (0 - e.block.permutation.getState('vc:strength'))) //resets old frequency
                if (isTopSlot) frequency[0] = getItemName(item)
                else frequency[1] = getItemName(item)
                if (e.block.getComponent('minecraft:dynamic_properties') == undefined) {
                    e.dimension.runCommand(`setblock ${vec3toString(e.block.location)} air destroy`)
                    return
                }
                e.block.getComponent('minecraft:dynamic_properties').set('vc:frequency', frequency.join('||'))
                if (isTrans) addGlobalStrength(frequency[0], frequency[1], (e.block.permutation.getState('vc:strength'))) //updated new frequency
                //console.warn(JSON.stringify(locfrequencies))

                e.dimension.playSound('block.itemframe.remove_item', e.block.center())
                setPermutation(e.block, 'vc:changing', false)
                e.player.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§l"},{"translate":"trans.freqset"},{"text":":\n§r§c - "},{"translate":"${frequency[0]}"},{"text":"\n§9 - "},{"translate":"${frequency[1]}"}]}`)
                
            } else {
                if (e.player.isSneaking) {
                    e.dimension.playSound(isTrans ? "redstone_link.switch.reciever" : "redstone_link.switch.transmitter", e.block.center(), {pitch: getRandomFloat(0.9,1.1)})
                    e.dimension.spawnParticle('vc:radar', offsetLocation(e.block.center(), valueBasedOnFacing([
                        {x:(4/16),y:0.7,z:(6.5/16)},
                        {x:(-4/16),y:0.7,z:(-6.5/16)},
                        {x:(-6.5/16),y:0.7,z:(4/16)},
                        {x:(6.5/16),y:0.7,z:(-4/16)},
                        {x:(4/16),y:0,z:(4/16)},
                        {x:(4/16),y:0,z:(-4/16)}
                    ], face)))
                    //if (e.block.typeId == "vc:redstone_link_transmitter") addGlobalStrength('test', 'test', (0 - e.block.permutation.getState('vc:strength')))
                    e.block.setType(isTrans ? "vc:redstone_link_reciever" : "vc:redstone_link_transmitter")
                    setPermutation(e.block, 'minecraft:block_face', face)
                    e.player.runCommand(`titleraw @s actionbar {"rawtext":[{"translate":"${!isTrans ? "trans.mode.trans" : "trans.mode.rec"}"}]}`)
                } else {
                    e.player.runCommand(`titleraw @s actionbar {"rawtext":[{"text":"§l"},{"translate":"trans.freqcheck"},{"text":":\n§r§c - "},{"translate":"${frequency[0]}"},{"text":"\n§9 - "},{"translate":"${frequency[1]}"}]}`)
                }
            }
            if (e.block.permutation.getState('vc:changing') == false) {
                setPermutation(e.block, 'vc:changing', true)
                SERVER.system.runTimeout(()=>{try{setPermutation(e.block, 'vc:changing', false)} catch {}}, 40)
            }
        }
    })
    initEvent.blockComponentRegistry.registerCustomComponent('vc:redstone_link_trans', {
        onRedstoneUpdate: e => {
            const prevst = e.block.permutation.getState('vc:strength')
            if (e.powerLevel != prevst) {
                const frequency = tryGetFrecValue(e.block)
                addGlobalStrength(frequency[0], frequency[1], (e.powerLevel - e.previousPowerLevel))
                setPermutation(e.block, 'vc:strength', e.powerLevel)
            }
        },
        onBreak: e => {
            const frequency = tryGetFrecValue(e.block)
            addGlobalStrength(frequency[0], frequency[1], (0 - e.brokenBlockPermutation.getState('vc:strength')))
        }
    });
    initEvent.blockComponentRegistry.registerCustomComponent('vc:redstone_link_reciever', {
        onTick: e => {
            //const frequency = tryGetFrecValue(e.block)
            //setPermutation(e.block, 'vc:strength', clamp(getGlobalStrength(frequency[0], frequency[1]), 0, 15))
        }
    });
    initEvent.blockComponentRegistry.registerCustomComponent('vc:dimmable_redstone_lamp', {
        onRedstoneUpdate: e => {
            setPermutation(e.block, 'vc:strength', e.powerLevel)
        }
    });
    initEvent.blockComponentRegistry.registerCustomComponent('vc:redstone_capacitor', {
        /*onPlayerInteract: e=>{
            const cap = e.block.permutation.getState('vc:charge')
            const ui = new UI.ModalFormData().title('Set Maximum Capacity').slider("Maximum value: ", 0, 15, {defaultValue: cap}).submitButton("gui.select")
            .show(e.player).then(r=>{
                if (r.canceled) return
                setPermutation(e.block, 'vc:charge', r.formValues[0])
            })
        },*/
        onTick: e=> {
            const backRedstoneValue = valueBasedOnFacing([e.block.south(1),e.block.south(-1),e.block.west(1),e.block.west(-1)], e.block.permutation.getState('minecraft:cardinal_direction')).getRedstonePower()
            if (backRedstoneValue == 0 && e.block.permutation.getState('vc:charge') == 0) {
                    setPermutation(e.block, 'vc:status', 'idle')
                    setPermutation(e.block, 'vc:strength', 0)
            } else if (backRedstoneValue >= e.block.permutation.getState('vc:charge')) {
                setPermutation(e.block, 'vc:status', 'charged')
                setPermutation(e.block, 'vc:strength', backRedstoneValue)
                setPermutation(e.block, 'vc:charge', clamp(e.block.permutation.getState('vc:charge') + 1, 0, backRedstoneValue))
                /*if (backRedstoneValue && backRedstoneValue >= e.block.permutation.getState('vc:strength')) {
                    if (e.block.permutation.getState('vc:status') == 'idle') setPermutation(e.block, 'vc:status', 'charging')
                    setPermutation(e.block, 'vc:strength', clamp(backRedstoneValue, 0, e.block.permutation.getState('vc:charge')))
                    if (e.block.permutation.getState('vc:strength') >= e.block.permutation.getState('vc:charge')) setPermutation(e.block, 'vc:status', 'charged')
                } else if (e.block.permutation.getState('vc:strength') >= e.block.permutation.getState('vc:charge') ){
                    setPermutation(e.block, 'vc:status', 'discharging')
                }*/
            } else {
                const charge = clamp(e.block.permutation.getState('vc:charge') - 1, 0, 15)
                setPermutation(e.block, 'vc:status', 'discharging')
                setPermutation(e.block, 'vc:charge', charge)
                setPermutation(e.block, 'vc:strength', charge)
                if (charge <= 0) {
                    setPermutation(e.block, 'vc:status', 'idle')
                    setPermutation(e.block, 'vc:strength', 0)
                }
                /*if (backRedstoneValue >= e.block.permutation.getState('vc:charge')) { setPermutation(e.block, 'vc:status', 'charged'); return}
                //else if (backRedstoneValue >= e.block.permutation.getState('vc:strength')) setPermutation(e.block, 'vc:status', 'charging')
                if (e.block.permutation.getState('vc:strength') > backRedstoneValue) {
                    setPermutation(e.block, 'vc:strength', e.block.permutation.getState('vc:strength') - 1)
                } else {
                    setPermutation(e.block, 'vc:status', 'idle')
                    setPermutation(e.block, 'vc:strength', 0)
                }*/
            }
        }
    })
})
SERVER.system.afterEvents.scriptEventReceive.subscribe(e=>{
    if (e.id == 'vc:grs') {
        SERVER.world.sendMessage(JSON.stringify(SERVER.world.getDynamicProperty('vc:transmitters')))
        //SERVER.world.sendMessage(JSON.stringify(locfrequencies()))
    }
    if (e.id === "vc:camera") {
        const entity = e.sourceEntity //idk why this is the original way I wrote it

        if (e.message == 'break')
            entity.runCommand(`camera @s clear`)
        else
            console.log(`camera @a set minecraft:free pos ${roundTo(entity.getHeadLocation().x,100)} ${roundTo(entity.getHeadLocation().y,100)} ${roundTo(entity.getHeadLocation().z,100)} rot ${roundTo(entity.getRotation().x,100)} ${roundTo(entity.getRotation().y,100)}`)
            entity.runCommand(`camera @s set minecraft:free pos ${roundTo(entity.getHeadLocation().x,100)} ${roundTo(entity.getHeadLocation().y,100)} ${roundTo(entity.getHeadLocation().z,100)} rot ${roundTo(entity.getRotation().x,100)} ${roundTo(entity.getRotation().y,100)}`)
    }
    if (e.id == 'vc:rgrs') {
        SERVER.world.sendMessage(SERVER.world.getDynamicProperty('vc:transmitters') || "[]")
        SERVER.world.setDynamicProperty('vc:transmitters', "[]")
    }
    if (e.id == 'vc:clearAllFrequencies') {
        SERVER.world.sendMessage(SERVER.world.getDynamicProperty('vc:locfreq') || "{}")
        SERVER.world.setDynamicProperty('vc:locfreq', "{}")
    }
})

/**
 * 
 * @param {String} frec1 
 * @param {String} frec2 
 * @param {Number} value 
 */
function addGlobalStrength(frec1, frec2, value) {
    const transmitters = JSON.parse(SERVER.world.getDynamicProperty('vc:transmitters') || "[]")
    for (const trans in transmitters) {
        if (transmitters[trans] && transmitters[trans][0] == frec1 && transmitters[trans][1] == frec2) {
            transmitters[trans][2] = clamp(Number(transmitters[trans][2]) + value, 0, 999999)
            SERVER.world.setDynamicProperty('vc:transmitters', JSON.stringify(cleanRedundancies(transmitters)))
            return
        }
    }
    //if not found
    transmitters.push([frec1, frec2, value])
    SERVER.world.setDynamicProperty('vc:transmitters', JSON.stringify(cleanRedundancies(transmitters)))
}
/**
 * 
 * @param {String} frec1 
 * @param {String} frec2
 */
function getGlobalStrength(frec1, frec2) {
    const transmitters = JSON.parse(SERVER.world.getDynamicProperty('vc:transmitters') || "[]")
    for (const trans of transmitters) {
        if (trans && trans[0] == frec1 && trans[1] == frec2) {
            return trans[2]
        }
    }
    //if not found
    return 0
}
/**
 * 
 * @param {SERVER.ItemStack} item 
 */
function getItemName(item) {
    if (!item) return "gui.none"
    return item.localizationKey
}
/**
 * Tries to get the frequency of the transmitter at that current location (if applicable), otherwise returns two none values
 * @param {SERVER.Block} block 
 * @returns {Array<String>}
 */
function tryGetFrecValue(block) {
    try {
        return block.getComponent('minecraft:dynamic_properties').get('vc:frequency').split('||')
    } catch {
        return ['gui.none', 'gui.none']
    }
}

function cleanRedundancies(list) {
    let newlist = []
    for (const trans in list) {
        if (list[trans] && list[trans][2] >= 1) newlist.push(list[trans])
    }
    return newlist
}

function locfrequencies() {
    return JSON.parse(SERVER.world.getDynamicProperty('vc:locfreq') || "{}")
}
function updateLocfreq(to) {
    for (const [key, value] of Object.entries(to)) {
        if (value == "gui.none||gui.none") delete to[key]
    }
    SERVER.world.setDynamicProperty('vc:locfreq', JSON.stringify(to))
}

/**
 * 
 * @param {Array} list values for North, South, East, West, Up, and Down respectively
 * @param {String} dir The actual direction
 */
function valueBasedOnFacing(list, dir) {
    return list[["north", "south", "east", "west", "up", "down"].indexOf(dir.toLowerCase())]
}