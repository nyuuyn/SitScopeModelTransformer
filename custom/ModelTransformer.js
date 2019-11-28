
'use strict';

export default class ModelTransformer{
constructor(bpmnjs,modeling,config,eventBus, bpmnRenderer, textRenderer,cli,bpmnFactory,bpmnReplace) {
    var self=this;
    this.cli=cli;
      this.bpmnjs=bpmnjs;
      this.modeling=modeling;
      this.defaultFillColor = config && config.defaultFillColor;
      this.defaultStrokeColor = config && config.defaultStrokeColor;
      this.bpmnRenderer = bpmnRenderer;
      this.textRenderer=textRenderer;
      this.bpmnFactory=bpmnFactory;
      this.bpmnReplace=bpmnReplace;
      //console.log(this.cli.help());
    }
      transformModel(){

        console.log(this.cli.help());

        var collabo = this.cli.element('StartEvent_1');

        
        var participant= this.cli.append('StartEvent_1', 'bpmn:Participant');   
        var participantshape = this.cli.element(participant);
        var definitions=participantshape.parent.businessObject.$parent;
        var rootElements = definitions.rootElements || [];
        var gateway = this.cli.append(
          'StartEvent_1',
          'bpmn:ExclusiveGateway',
          '150,0'
        );
       // console.log(participantshape.parent);     

       var sendTask = this.cli.append(
        gateway,
        'bpmn:SendTask',
        '150,0'
      );
      var sendTaskshape = this.cli.element(sendTask);

      var boundary = this.cli.create('bpmn:BoundaryEvent',{
        x: sendTaskshape.x ,
        y: sendTaskshape.y + 70
      }, sendTaskshape,true);

      var boundaryShape=this.cli.element(boundary);
      this.bpmnReplace.replaceElement(boundaryShape,{
        type: "bpmn:BoundaryEvent",
        eventDefinitionType: "bpmn:TimerEventDefinition"
    });
      var endEvent1 = this.cli.append(
        sendTask,
        'bpmn:EndEvent',
        '150,0'
      );
      var sendTask2 = this.cli.append(
        gateway,
        'bpmn:SendTask',
        '150,0'
      );
      var endEvent2 = this.cli.append(
        sendTask2,
        'bpmn:EndEvent',
        '150,0'
      );
      var participantstart=  this.createNewParticipant(participantshape, rootElements);
      var receiveTask = this.cli.append(
        participantstart,
        'bpmn:ReceiveTask',
        '150,0'
      );
      var endEventmore = this.cli.append(
        receiveTask,
        'bpmn:EndEvent',
        '150,0'
      );
      var participantstart2=  this.createNewParticipant(participantshape, rootElements);
      var receiveTask2 = this.cli.append(
        participantstart2,
        'bpmn:ReceiveTask',
        '150,0'
      );
      var endEventmore2 = this.cli.append(
        receiveTask2,
        'bpmn:EndEvent',
        '150,0'
      );
      this.cli.connect(
        sendTask,
        receiveTask,
        'bpmn:MessageFlow',
        '150,0'
      );
      this.cli.connect(
        sendTask2,
        receiveTask2,
        'bpmn:MessageFlow',
        '150,0'
      );
        console.log(participantstart);
        console.log(definitions);
        console.log(rootElements);


      




       }
    

  createNewParticipant(participantshape, rootElements) {
    var start = this.cli.create('bpmn:Participant', {
      x: participantshape.x + 50,
      y: participantshape.y + 150
    }, participantshape.parent);
    var participantshape2 = this.cli.element(start);
    var processelement = this.bpmnFactory.create('bpmn:Process');
    rootElements.push(processelement);
    participantshape2.businessObject.processRef = processelement;
    var start2 = this.cli.create('bpmn:StartEvent', {
      x: participantshape2.x + 50,
      y: participantshape2.y + 150
    }, participantshape2);

    return start2;
  }
  }
    
    
ModelTransformer.$inject = [ 'bpmnjs','modeling','config',
 'eventBus', 'bpmnRenderer', 'textRenderer','cli','bpmnFactory','bpmnReplace'];
