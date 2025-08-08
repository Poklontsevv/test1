export default class BootScene extends Phaser.Scene {
  constructor(){ super('Boot'); }
  preload(){
    // We draw everything with Graphics at runtime; add a single white pixel texture for simplicity.
    const g = this.make.graphics({x:0,y:0,add:false});
    g.fillStyle(0xffffff,1).fillRect(0,0,1,1);
    g.generateTexture('px',1,1);
  }
  create(){ this.scene.start('Game'); this.scene.launch('UI'); }
}
