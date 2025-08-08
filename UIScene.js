export default class UIScene extends Phaser.Scene {
  constructor(){ super('UI'); }
  create(){
    this.timerText = this.add.text(10,10,'Time: 180',{fontSize:18, color:'#cde6ff'}).setDepth(1000);
    this.p1Text = this.add.text(10,34,'P1 ✦ 0',{fontSize:18, color:'#9cff9c'}).setDepth(1000);
    this.p2Text = this.add.text(10,58,'P2 ✦ 0',{fontSize:18, color:'#ff9ccc'}).setDepth(1000);
    this.centerText = this.add.text(480,20,'SPECTRUM S — Mining PvP',{fontSize:18,color:'#ccd'}).setOrigin(.5,0).setDepth(1000);
    this.events.on('updateScores', ({p1,p2})=>{
      this.p1Text.setText('P1 ✦ '+p1);
      this.p2Text.setText('P2 ✦ '+p2);
    });
    this.events.on('tick',(t)=>this.timerText.setText('Time: '+t));
    this.events.on('banner',(msg)=>{
      const b = this.add.text(480,270,msg,{fontSize:28,color:'#fff'}).setOrigin(.5).setDepth(1000);
      this.tweens.add({targets:b,alpha:0,y:230,duration:1600,onComplete:()=>b.destroy()});
    });
  }
}
