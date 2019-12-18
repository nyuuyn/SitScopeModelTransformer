
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
      this.participantshapeposition=1;
      this.lastparticipantshape;
      this.taskpositioncounter=0;

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
        //console.log(startingSituationalScope);
        //var isfirstelementChoreography=this.checknextelement(startingSituationalScope);
        //console.log(firstelementChoreography);
        //TODO if firstelementChoreography false, 
        var startingChoreographyTask=this.findStartingChoreographyTask(startingSituationalScope);
        //console.log(startingChoreographyTask);
        //initiating participant of the initiating situation choreography
        var participantref= startingChoreographyTask.$.initiatingParticipantRef;
        var fittingParticipantName;
        fittingParticipantName = this.getParticipant(participants, participantref);
        //create the first participant which includes the regular path and error paths
        var participant= this.cli.append(collabo.id, 'bpmn:Participant');   
        var participantshape = this.cli.element(participant);
        this.modeling.updateProperties(participantshape,{id:participantref});    

        this.cli.setLabel(participantshape,fittingParticipantName);
        this.lastparticipantshape=participantshape;

        //console.log(participantshape);
        //start of evaluation of situation and standard situation execution subprocess

        this.createEvaluationProcess(collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, startingSituationalScope, sequenceFlows, subProcesses, fittingParticipantName);
        
       }
    

  createEvaluationProcess(collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, startingSituationalScope, sequenceFlows, subProcesses, fittingParticipantName) {
    //console.log("evaluation");
    var evaluationSubprocess = this.cli.append(collabo.id, 'bpmn:SubProcess', '300,300');
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
    var end2 = this.cli.append(evaluationSubprocess, 'bpmn:EndEvent','300,-300');
    //create participants which have to be evaluated for their situation
    for (var i = 0; i < startingChoreographyTask["bpmn2:participantRef"].length; i++) {
      if (startingChoreographyTask["bpmn2:participantRef"].length > 2) {
        //if multiple Participants, create a parallel gateway and connect messages
      }
      //all participants which are not the initiating participant
      if (startingChoreographyTask["bpmn2:participantRef"][i] != participantref) {
        var participantname = this.getParticipant(participants, startingChoreographyTask["bpmn2:participantRef"][i]);
        var interactingParticipantStarEvent = this.createNewParticipant(this.lastparticipantshape, rootElements,startingChoreographyTask["bpmn2:participantRef"][i]);
        var interactingParticipantShape = this.cli.element(interactingParticipantStarEvent);
        //console.log(interactingParticipantShape.parent);
        this.lastparticipantshape=interactingParticipantShape.parent;
        this.cli.setLabel(interactingParticipantShape.parent, participantname);
        var requestSendTask = this.cli.append(subprocessStartEvent, 'bpmn:SendTask', '150,150');
        this.cli.setLabel(requestSendTask, "Request availability");
        var requestReceiveTask = this.cli.append(interactingParticipantStarEvent, 'bpmn:ReceiveTask', '150,0');
        this.cli.setLabel(requestReceiveTask, "Receive availability request");
        this.cli.connect(requestSendTask, requestReceiveTask, 'bpmn:MessageFlow', '150,0');
        var responseSendTask = this.cli.append(requestReceiveTask, 'bpmn:SendTask', '150,0');
        this.cli.setLabel(responseSendTask, "Send availability");
        var responseReceiveTask = this.cli.append(requestSendTask, 'bpmn:ReceiveTask', '150,-150');
        this.cli.setLabel(responseReceiveTask, "Receive availability");
        this.cli.connect(responseSendTask, responseReceiveTask, 'bpmn:MessageFlow', '150,0');
        var gateway = this.cli.append(responseReceiveTask, 'bpmn:ExclusiveGateway', '150,150');
        this.cli.connect(gateway, requestSendTask, 'bpmn:SequenceFlow', '150,0');
        var interactSendTask = this.cli.append(gateway, 'bpmn:SendTask', '150,-150');
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
      x: evaluationSubprocessShape.x+evaluationSubprocessShape.width,
      y: evaluationSubprocessShape.y + 70
    }, evaluationSubprocessShape, true);
    var boundaryShape = this.cli.element(boundary);
    this.bpmnReplace.replaceElement(boundaryShape, {
      type: "bpmn:BoundaryEvent",
      eventDefinitionType: "bpmn:TimerEventDefinition"
    });
    
    var adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway', '150,0');
    //find adaption situations
  
      this.findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision);

    
  }


  

  findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision) {
   
    var sitscopeoutgoingflows = startingSituationalScope["bpmn2:outgoing"];
    if(typeof sitscopeoutgoingflows!=='undefined'){
      for (var i = 0; i < sitscopeoutgoingflows.length; i++) {
        for (var j = 0; j < sequenceFlows.length; j++) {
          if (sitscopeoutgoingflows[i] == sequenceFlows[j].$.id) {
            //console.log(sequenceFlows[j].$.targetRef);
            if ((sequenceFlows[j].$.flowtype === "Adapt")||typeof sequenceFlows[j].$.flowtype === 'undefined') {
              //console.log(sequenceFlows[j].$.flowtype);
              var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
              //console.log("Adapt");
  

              this.createAllParticipantsOfSitScope(participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, sit);
  
              if (typeof sit["bpmn2:outgoing"] !== 'undefined') {
  
                this.findAppendedSituationalScopes(sit,sequenceFlows,subProcesses,participants,fittingParticipantName,participantshape,rootElements,adaptiondecision);
               //console.log("available stuff");
              }
              
            }
            
            else if(sequenceFlows[j].$.flowtype === "Continue"){
              //console.log(sequenceFlows[j].$.flowtype);
              var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
              //console.log("Continue");

              var chortask = this.findStartingChoreographyTask(sit);
              console.log(chortask);
  
              var collabo = this.cli.element(chortask.$.initiatingParticipantRef);
              //console.log(collabo);
              var partendevent;
              for(var endEventIterator=0;endEventIterator<collabo.children.length;endEventIterator++){
                if(collabo.children[endEventIterator].type=="bpmn:EndEvent"){
                  partendevent=this.cli.element(collabo.children[endEventIterator].id);
                }
                //this.cli.setLabel(partendevent,"Evaluate")
              }
              //console.log(partendevent.incoming[0].businessObject.sourceRef.id);
              var lastmessagetask=this.cli.element(partendevent.incoming[0].businessObject.sourceRef.id);
              //console.log(lastmessagetask);
              this.cli.removeShape(partendevent);
              this.createEvaluationProcess(lastmessagetask, chortask, chortask.$.initiatingParticipantRef, participants, participantshape, rootElements, sit, sequenceFlows, subProcesses, fittingParticipantName);

              //var partendevent= this.bpmnReplace.replaceElement(partendevent, {
              //  type: "bpmn:Task"                
              //});
              
  
              //console.log(sequenceFlows[j].$.flowtype);
            }
          }
        }
      }
    }

  }

  createAllParticipantsOfSitScope( participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, situationscope,chortask,fittingsituationsequenceflow) {
    var appendedelement=adaptiondecision;
    var currentfittingsituationsequenceflow;
    console.log(fittingsituationsequenceflow);
    var elementcheck=this.checknextelement(situationscope,fittingsituationsequenceflow);
    
    var currentchortask=chortask;
    console.log(elementcheck[0]);
    console.log(elementcheck[1]);
    currentfittingsituationsequenceflow=elementcheck[1];
    var situationsequenceflows=situationscope["bpmn2:sequenceFlow"];
    var situationendevents=situationscope["bpmn2:endEvent"];
    var choreographytasks=situationscope["bpmn2:choreographyTask"];

    if(elementcheck[0]!==true){
      var foundchoreography;
      var foundgateway=this.appendgateway(situationscope,elementcheck[1],appendedelement);
      if(typeof foundgateway[0]!=='undefined'){
        appendedelement=foundgateway[1];

        var gatewaysequenceflows=foundgateway[0]["bpmn2:outgoing"];
        for(var outgoingvalues=0;outgoingvalues<gatewaysequenceflows.length;outgoingvalues++){
          var fittingsituationsequenceflow;
          for (var i = 0; i < situationsequenceflows.length; i++) {
          // look the sequenceflow which belongs to the start event inside the situationalscope
            if (situationsequenceflows[i].$.id == gatewaysequenceflows[outgoingvalues]) {
              console.log(situationsequenceflows[i].$.id);
              fittingsituationsequenceflow = situationsequenceflows[i].$.id;
            }
          }
          for (var i = 0; i < choreographytasks.length; i++) {
          // look for the choreography task belonging to the sequenceflow
            if (choreographytasks[i].$.id == fittingsituationsequenceflow) {
              console.log("find it");
              foundchoreography= choreographytasks[i];
            }
    
        }
        console.log(foundgateway);
        console.log(gatewaysequenceflows[outgoingvalues]);
  
    
        this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,appendedelement,situationscope,foundchoreography,fittingsituationsequenceflow);
          //this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,appendedelement,situationscope);
        }
      }else{
        var endadaptionevent = this.cli.append(appendedelement, 'bpmn:EndEvent');
      }

      

    }else{
      if(typeof currentchortask==='undefined'){
        currentchortask = this.findChoreographyTask(situationscope,currentfittingsituationsequenceflow);

      }

      var taskparticipants = currentchortask["bpmn2:participantRef"];
      var taskoutgoingsequenceflows=currentchortask["bpmn2:outgoing"];
      console.log(currentchortask);
  
  
      //console.log(chortask);
      //console.log(situationscope);
      var taskpositioncounter=0;
  
      if(typeof choreographytasks !== 'undefined'){
        for(var chorincrement=0;chorincrement<choreographytasks.length;chorincrement++){
          if(currentchortask.$.id==choreographytasks[chorincrement].$.id){
      for (var k = 0; k < taskparticipants.length; k++) {
        var taskparticipantname = this.getParticipant(participants, taskparticipants[k]);
        //console.log(situationscope);
        //console.log(chortask);
  
        //console.log(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined');
        if (taskparticipantname != fittingParticipantName) {
          if(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined'){
            var newinteractingparticipant = this.createNewParticipant(this.lastparticipantshape, rootElements,taskparticipants[k]);
            var newinteractingParticipantShape = this.cli.element(newinteractingparticipant);
            //console.log(taskparticipants[k]);
            //console.log(newinteractingParticipantShape.parent);
            this.cli.setLabel(newinteractingParticipantShape.parent, taskparticipantname);
            this.lastparticipantshape=newinteractingParticipantShape.parent;
            var sendtaskposition_y=this.taskpositioncounter*100;
            var sendtaskposition='150,'+sendtaskposition_y;
            //console.log(sendtaskposition);
            var adaptionmessagetask = this.cli.append(appendedelement, 'bpmn:SendTask', sendtaskposition);
            this.taskpositioncounter++;
            var adaptionreceivemessagetask = this.cli.append(newinteractingparticipant, 'bpmn:ReceiveTask', '150,0');
            var interactionmessage = this.cli.connect(adaptionmessagetask, adaptionreceivemessagetask, 'bpmn:MessageFlow', '150,0');
            this.cli.setLabel(interactionmessage, currentchortask.$.name);
            var endadaptionreceiveevent = this.cli.append(adaptionreceivemessagetask, 'bpmn:EndEvent');
            for(var m=0;m<taskoutgoingsequenceflows.length;m++){
              for(var l=0;l<situationsequenceflows.length;l++){
                if(taskoutgoingsequenceflows[m]== situationsequenceflows[l].$.id){
  
  
                  var foundendevent=false;
                  for(var n=0;n<situationendevents.length;n++){
                    if(situationsequenceflows[l].$.targetRef==situationendevents[n].$.id){
                      foundendevent=true;
                    }
                  }
                  if(foundendevent){
                    console.log("Endevent");
                    var endadaptionevent = this.cli.append(adaptionmessagetask, 'bpmn:EndEvent');
                    
                  }else{
                    var followingchoreography=this.findChoreographyTask(situationscope,situationsequenceflows[l].$.targetRef)
                    console.log("noendevent");
                    //enable gateways and events
                    //console.log(followingchoreography);
                    this.taskpositioncounter=0;
                    this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,adaptionmessagetask,situationscope,followingchoreography,situationsequenceflows[l].$.id);
                  }
                }
              }
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
  checknextelement(situationalScope,outgoingelement){
    
    var situationchoreographytask = situationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = situationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = outgoingelement;
    var fittingsituationsequenceflow;
    var foundsituationchoreographytask;
    console.log("why not");
    console.log(situationalScope);
console.log(outgoingsituationstart);
    if(typeof outgoingsituationstart==='undefined'){
      console.log("why");
      var situationstart = situationalScope["bpmn2:startEvent"][0];
      console.log(situationstart);

      outgoingsituationstart=situationstart["bpmn2:outgoing"][0];
      console.log(outgoingsituationstart);

    }
    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        console.log(situationsequenceFlows[i].$.targetRef);
        fittingsituationsequenceflow = situationsequenceFlows[i].$.targetRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == fittingsituationsequenceflow) {
        console.log("find it");
        return [true,fittingsituationsequenceflow];
      }

    }
    if(typeof foundsituationchoreographytask==='undefined'){
          return [false,fittingsituationsequenceflow];
        
      
    }
  }
  findStartingChoreographyTask(startingSituationalScope) {
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = situationstart["bpmn2:outgoing"][0];
    var fittingsituationsequenceflow;
    var foundsituationchoreographytask;
    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        fittingsituationsequenceflow = situationsequenceFlows[i].$.targetRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == fittingsituationsequenceflow) {
        foundsituationchoreographytask= situationchoreographytask[i];
      }

    }
    
    return foundsituationchoreographytask;
  }
  appendgateway(startingSituationalScope,fittingsituationsequenceflow,appendedelement){
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];

    var situationeventBasedGateway=startingSituationalScope["bpmn2:eventBasedGateway"];
    var situationcomplexGateway=startingSituationalScope["bpmn2:complexGateway"];
    var situationexclusiveGateway=startingSituationalScope["bpmn2:exclusiveGateway"];
    var situationinclusiveGateway=startingSituationalScope["bpmn2:inclusiveGateway"];
    var situationparallelGateway=startingSituationalScope["bpmn2:parallelGateway"];
    var choreographytasks=startingSituationalScope["bpmn2:choreographyTask"];
    var foundgateway;
    var newappendix;
    var sendtaskposition_y=this.taskpositioncounter*100;
    var sendtaskposition='150,'+sendtaskposition_y;
    console.log(startingSituationalScope);
    console.log(fittingsituationsequenceflow);
    if(typeof situationexclusiveGateway !=='undefined'){
      console.log("test");
      for(var n=0;n<situationexclusiveGateway.length;n++){
        console.log(situationexclusiveGateway[n]['$']["bpmn:incoming"]);
        if(situationexclusiveGateway[n].$.id==fittingsituationsequenceflow){
          foundgateway = situationexclusiveGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:ExclusiveGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationeventBasedGateway !=='undefined'){
      console.log("test");
      for(var n=0;n<situationeventBasedGateway.length;n++){
        console.log(situationeventBasedGateway[n]['$']["bpmn:incoming"]);
        if(situationeventBasedGateway[n].$.id==fittingsituationsequenceflow){
          foundgateway = situationeventBasedGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:EventBasedGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationcomplexGateway !=='undefined'){
      console.log("test");
      for(var n=0;n<situationcomplexGateway.length;n++){
        console.log(situationcomplexGateway[n]['$']["bpmn:incoming"]);
        if(situationcomplexGateway[n].$.id==fittingsituationsequenceflow){
          foundgateway = situationcomplexGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:ComplexGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationinclusiveGateway !=='undefined'){
      console.log("test");
      for(var n=0;n<situationinclusiveGateway.length;n++){
        console.log(situationinclusiveGateway[n]['$']["bpmn:incoming"]);
        if(situationinclusiveGateway[n].$.id==fittingsituationsequenceflow){
          foundgateway = situationinclusiveGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:InclusiveGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationparallelGateway !=='undefined'){
      console.log("test");
      for(var n=0;n<situationparallelGateway.length;n++){
        console.log(situationparallelGateway[n]['$']["bpmn:incoming"]);
        if(situationparallelGateway[n].$.id==fittingsituationsequenceflow){
          foundgateway = situationparallelGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:ParallelGateway',sendtaskposition);

        }
      }
  
    }
    return [foundgateway,newappendix];
    /*
     */

    
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
      // find the sequenceflow belonging to the start event
      if (sequenceFlows[i].$.id == outgoingstart) {
        fittingsequenceflow = sequenceFlows[i].$.targetRef;
      }
    }

    for (var i = 0; i < subProcesses.length; i++) {
      // find the target situational scope
      if (subProcesses[i].$.id == fittingsequenceflow) {
        return subProcesses[i];
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
      x: participantshape.x + 200,
      y: participantshape.y + participantshape.height+200
    }, participantshape.parent);
    var participantshape2 = this.cli.element(start);
    //console.log(participantid);
    var test=this.elementRegistry.get(participantid);
    //console.log(test);
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
