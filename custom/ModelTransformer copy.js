
'use strict';

export default class ModelTransformer{
constructor(bpmnjs,modeling,config,eventBus, bpmnRenderer, textRenderer,cli,bpmnFactory,bpmnReplace,elementRegistry) {
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
      this.elementRegistry=elementRegistry;
      //console.log(this.cli.help());
    }
      transformModel(result){

        console.log(result);
        
        var collabo = this.cli.element('StartEvent_1');
        var diagramDefinitions= result["bpmn2:definitions"];
        var choreo=diagramDefinitions["bpmn2:choreography"];
        var messages=diagramDefinitions["bpmn2:message"];
        var sequenceFlows=choreo[0]["bpmn2:sequenceFlow"];
        var participants=choreo[0]["bpmn2:participant"];
        var messageFlows=choreo[0]["bpmn2:messageFlow"];
        var subProcesses=choreo[0]["bpmn2:subProcess"];
        var startEvent=choreo[0]["bpmn2:startEvent"][0];
        var endEvents=choreo[0]["bpmn2:endEvent"];
        console.log(collabo);

        var diagramDefinitions=collabo.businessObject.$parent.$parent;
        var rootElements = diagramDefinitions.rootElements || [];

        var startingSituationalScope=this.findStartingSituationalScope(startEvent, sequenceFlows, subProcesses);
        console.log(startingSituationalScope);

        var startingChoreographyTask=this.findStartingChoreographyTask(startingSituationalScope);
        //console.log(startingChoreographyTask);
        //initiating participant of the initiating situation choreography
        var participantref= startingChoreographyTask.$.initiatingParticipantRef;
        var fittingParticipantName;
        fittingParticipantName = this.getParticipant(participants, participantref);
        var participant= this.cli.append(collabo.id, 'bpmn:Participant');   
        var participantshape = this.cli.element(participant);
        this.modeling.updateProperties(participantshape,{id:participantref});    

        this.cli.setLabel(participantshape,fittingParticipantName);
        //console.log(participantshape);
        //start of evaluation of situation and standard situation execution subprocess

        this.continueSituation(collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, startingSituationalScope, sequenceFlows, subProcesses, fittingParticipantName);
        /*
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
      );*/
     //   console.log(participantstart);
      //  console.log(definitions);
      //  console.log(rootElements);


      




       }
    

  continueSituation(collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, startingSituationalScope, sequenceFlows, subProcesses, fittingParticipantName) {
    console.log("continueSituation");
    var evaluationSubprocess = this.cli.append(collabo.id, 'bpmn:SubProcess', '150,0');
    this.bpmnReplace.replaceElement(this.cli.element(evaluationSubprocess), {
      type: "bpmn:SubProcess",
      isExpanded: true
    });
    var evaluationSubprocessShape = this.cli.element(evaluationSubprocess);
    //console.log(this.cli.element(evaluationSubprocessShape));
    var subprocessStartEvent = this.cli.create('bpmn:StartEvent', {
      x: evaluationSubprocessShape.x,
      y: evaluationSubprocessShape.y
    }, evaluationSubprocessShape);
    var end2 = this.cli.append(evaluationSubprocess, 'bpmn:EndEvent');
    //create participants which have to be evaluated for their situation
    for (var i = 0; i < startingChoreographyTask["bpmn2:participantRef"].length; i++) {
      if (startingChoreographyTask["bpmn2:participantRef"].length > 2) {
        //if multiple Participants, create a parallel gateway and connect messages
      }
      //all participants which are not the initiating participant
      if (startingChoreographyTask["bpmn2:participantRef"][i] != participantref) {
        var participantname = this.getParticipant(participants, startingChoreographyTask["bpmn2:participantRef"][i]);
        var interactingParticipantStarEvent = this.createNewParticipant(participantshape, rootElements,startingChoreographyTask["bpmn2:participantRef"][i]);
        var interactingParticipantShape = this.cli.element(interactingParticipantStarEvent);
        this.cli.setLabel(interactingParticipantShape.parent, participantname);
        var requestSendTask = this.cli.append(subprocessStartEvent, 'bpmn:SendTask', '150,0');
        this.cli.setLabel(requestSendTask, "Request availability");
        var requestReceiveTask = this.cli.append(interactingParticipantStarEvent, 'bpmn:ReceiveTask', '150,0');
        this.cli.setLabel(requestReceiveTask, "Receive availability request");
        this.cli.connect(requestSendTask, requestReceiveTask, 'bpmn:MessageFlow', '150,0');
        var responseSendTask = this.cli.append(requestReceiveTask, 'bpmn:SendTask', '150,0');
        this.cli.setLabel(responseSendTask, "Send availability");
        var responseReceiveTask = this.cli.append(requestSendTask, 'bpmn:ReceiveTask', '150,0');
        this.cli.setLabel(responseReceiveTask, "Receive availability");
        this.cli.connect(responseSendTask, responseReceiveTask, 'bpmn:MessageFlow', '150,0');
        var gateway = this.cli.append(responseReceiveTask, 'bpmn:ExclusiveGateway', '150,0');
        this.cli.connect(gateway, requestSendTask, 'bpmn:SequenceFlow', '150,0');
        var interactSendTask = this.cli.append(gateway, 'bpmn:SendTask', '150,0');
        this.cli.setLabel(interactSendTask, "Execute interaction");
        var interactReceiveTask = this.cli.append(responseSendTask, 'bpmn:ReceiveTask', '150,0');
        this.cli.setLabel(interactReceiveTask, "Execute request");
        this.cli.connect(interactSendTask, interactReceiveTask, 'bpmn:MessageFlow', '150,0');
        var endSubprocess = this.cli.append(interactSendTask, 'bpmn:EndEvent');
        var endinteractingparticipantprocess = this.cli.append(interactReceiveTask, 'bpmn:EndEvent');
      }
    }
    //adaption path
    var boundary = this.cli.create('bpmn:BoundaryEvent', {
      x: evaluationSubprocessShape.x,
      y: evaluationSubprocessShape.y + 70
    }, evaluationSubprocessShape, true);
    var boundaryShape = this.cli.element(boundary);
    this.bpmnReplace.replaceElement(boundaryShape, {
      type: "bpmn:BoundaryEvent",
      eventDefinitionType: "bpmn:TimerEventDefinition"
    });
    var adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway', '150,0');
    //find adaption situations
    var lastsit = this.findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision);
  }

  findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision) {
    var sitscopeoutgoingflows = startingSituationalScope["bpmn2:outgoing"];
    for (var i = 0; i < sitscopeoutgoingflows.length; i++) {
      for (var j = 0; j < sequenceFlows.length; j++) {
        if (sitscopeoutgoingflows[i] == sequenceFlows[j].$.id) {
          console.log(sequenceFlows[j].$.targetRef);
          if (sequenceFlows[j].$.flowtype !== "Continue") {
            //console.log(sequenceFlows[j].$.flowtype);
            var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
            console.log("Adapt");

            console.log(sit);
            var chortask = this.findStartingChoreographyTask(sit);
            this.createAllParticipantsOfSitScope(chortask, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, sit);

            if (typeof sit["bpmn2:outgoing"] !== 'undefined') {

              this.findAppendedSituationalScopes(sit,sequenceFlows,subProcesses,participants,fittingParticipantName,participantshape,rootElements,adaptiondecision);
             //console.log("available stuff");
            }
            
          }
          else {
            //console.log(sequenceFlows[j].$.flowtype);
            var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
            console.log("Continue");

            console.log(sit);
            var chortask = this.findStartingChoreographyTask(sit);
            console.log(chortask);

            var collabo = this.cli.element(chortask.$.initiatingParticipantRef);
            //console.log(collabo);
            for(var endEventIterator=0;endEventIterator<collabo.children.length;endEventIterator++){
              if(collabo.children[endEventIterator].type=="bpmn:EndEvent"){
                //console.log(this.cli.element(collabo.children[endEventIterator].id));
                var partendevent=this.cli.element(collabo.children[endEventIterator].id);
                //console.log(partendevent.incoming[0].businessObject.sourceRef.id);
                var lastmessagetask=this.cli.element(partendevent.incoming[0].businessObject.sourceRef.id);
                //console.log(lastmessagetask);
                this.cli.removeShape(partendevent);
                this.continueSituation(lastmessagetask, chortask, chortask.$.initiatingParticipantRef, participants, participantshape, rootElements, sit, sequenceFlows, subProcesses, fittingParticipantName);

                //var partendevent= this.bpmnReplace.replaceElement(partendevent, {
                //  type: "bpmn:Task"                
                //});
              }
              //this.cli.setLabel(partendevent,"Evaluate")
            }
            

            console.log(sequenceFlows[j].$.flowtype);
          }
        }
      }
    }
    return sit;
  }

  createAllParticipantsOfSitScope(chortask, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, situationscope) {
    var taskparticipants = chortask["bpmn2:participantRef"];
    var taskoutgoingsequenceflows=chortask["bpmn2:outgoing"];
    var situationsequenceflows=situationscope["bpmn2:sequenceFlow"];
    var situationendevents=situationscope["bpmn2:endEvent"];
    //console.log(chortask);
    //console.log(situationscope);
    for (var k = 0; k < taskparticipants.length; k++) {
      var taskparticipantname = this.getParticipant(participants, taskparticipants[k]);
      console.log(taskparticipantname);

      console.log(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined');
      if (taskparticipantname != fittingParticipantName) {
        if(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined'){
          var newinteractingparticipant = this.createNewParticipant(participantshape, rootElements,taskparticipants[k]);
          var newinteractingParticipantShape = this.cli.element(newinteractingparticipant);
          //console.log(taskparticipants[k]);
          //console.log(newinteractingParticipantShape.parent);
          this.cli.setLabel(newinteractingParticipantShape.parent, taskparticipantname);
          var adaptionmessagetask = this.cli.append(adaptiondecision, 'bpmn:SendTask', '150,0');
          var adaptionreceivemessagetask = this.cli.append(newinteractingparticipant, 'bpmn:ReceiveTask', '150,0');
          var interactionmessage = this.cli.connect(adaptionmessagetask, adaptionreceivemessagetask, 'bpmn:MessageFlow', '150,0');
          this.cli.setLabel(interactionmessage, chortask.$.name);
          var endadaptionreceiveevent = this.cli.append(adaptionreceivemessagetask, 'bpmn:EndEvent');
          for(var m=0;m<taskoutgoingsequenceflows.length;m++){
            for(var l=0;l<situationsequenceflows.length;l++){
              if(taskoutgoingsequenceflows[m]== situationsequenceflows[l].$.id){
                for(var n=0;n<situationendevents.length;n++){
                  if(situationsequenceflows[l].$.targetRef==situationendevents[n].$.id){
                    var endadaptionevent = this.cli.append(adaptionmessagetask, 'bpmn:EndEvent');
  
                  }else{
                    var followingchoreography=this.findChoreographyTask(situationscope,situationsequenceflows[l].$.targetRef)
                    //enable gateways and events
                    //console.log(followingchoreography);
                    this.createAllParticipantsOfSitScope(followingchoreography,participants,fittingParticipantName,participantshape,rootElements,adaptionmessagetask,situationscope);
                  }
                }
              }
            }
          }
        }
        
        



      }
    }
  }

  getParticipant(participants, participantref) {
    for (var i = 0; i < participants.length; i++) {
      // look for the entry with a matching `code` value
      if (participants[i].$.id == participantref) {
        return participants[i].$.name;
        // obj[i].name is the matched result
      }
    }
    
  }

  findStartingChoreographyTask(startingSituationalScope) {
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = situationstart["bpmn2:outgoing"][0];
    var fittingsituationsequenceflow;
    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look for the entry with a matching `code` value
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        fittingsituationsequenceflow = situationsequenceFlows[i].$.targetRef;
        // obj[i].name is the matched result
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the entry with a matching `code` value
      if (situationchoreographytask[i].$.id == fittingsituationsequenceflow) {
        return situationchoreographytask[i];
        // obj[i].name is the matched result
      }
    }
  }

  findChoreographyTask(situationalscope, choreographyid) {
    var situationchoreographytask = situationalscope["bpmn2:choreographyTask"];

    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the entry with a matching `code` value
      if (situationchoreographytask[i].$.id == choreographyid) {
        return situationchoreographytask[i];
        // obj[i].name is the matched result
      }
    }
  }

  findStartingSituationalScope(startEvent, sequenceFlows, subProcesses) {
    var outgoingstart = startEvent["bpmn2:outgoing"][0];
    var fittingsequenceflow;
    for (var i = 0; i < sequenceFlows.length; i++) {
      // look for the entry with a matching `code` value
      if (sequenceFlows[i].$.id == outgoingstart) {
        fittingsequenceflow = sequenceFlows[i].$.targetRef;
        // obj[i].name is the matched result
      }
    }

    for (var i = 0; i < subProcesses.length; i++) {
      // look for the entry with a matching `code` value
      if (subProcesses[i].$.id == fittingsequenceflow) {
        return subProcesses[i];
        // obj[i].name is the matched result
      }
    }
  }


  findSituationalScope(sitscopes, sitscopename) {
    for (var i = 0; i < sitscopes.length; i++) {
      // look for the entry with a matching `code` value
      if (sitscopes[i].$.id == sitscopename) {
        return  sitscopes[i];      // obj[i].name is the matched result
      }
    }

    
  }


  createNewParticipant(participantshape, rootElements,participantid) {
    var start = this.cli.create('bpmn:Participant', {
      x: participantshape.x + 50,
      y: participantshape.y + 150
    }, participantshape.parent);
    var participantshape2 = this.cli.element(start);
    //console.log(participantid);
    var test=this.elementRegistry.get(participantid);
    console.log(test);
this.modeling.updateProperties(participantshape2,{id:participantid});    
    //console.log(participantshape2);

    var processelement = this.bpmnFactory.create('bpmn:Process');
    rootElements.push(processelement);
    participantshape2.businessObject.processRef = processelement;
    var start2 = this.cli.create('bpmn:StartEvent', {
      x: participantshape2.x ,
      y: participantshape2.y
    }, participantshape2);

    return start2;
  }
  }
    
    
ModelTransformer.$inject = [ 'bpmnjs','modeling','config',
 'eventBus', 'bpmnRenderer', 'textRenderer','cli','bpmnFactory','bpmnReplace','elementRegistry'];
