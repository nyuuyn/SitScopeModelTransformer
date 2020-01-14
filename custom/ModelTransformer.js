
'use strict';

import { has } from "min-dash";

export default class ModelTransformer {
  constructor(bpmnjs, modeling, config, eventBus, bpmnRenderer, textRenderer, cli, bpmnFactory, bpmnReplace, elementRegistry, moddle) {

    this.cli = cli;
    this.bpmnjs = bpmnjs;
    this.modeling = modeling;
    this.defaultFillColor = config && config.defaultFillColor;
    this.defaultStrokeColor = config && config.defaultStrokeColor;
    this.bpmnRenderer = bpmnRenderer;
    this.textRenderer = textRenderer;
    this.bpmnFactory = bpmnFactory;
    this.bpmnReplace = bpmnReplace;
    this.elementRegistry = elementRegistry;
    this.moddle = moddle;
    //incrementing counter for participant shape positioning
    this.participantshapeposition = 1;
    //last shape used when placing participants
    this.lastparticipantshape;
    //incrementing counter for task shape positioning when multiple tasks are created from outgoing gateways
    this.taskpositioncounter = 0;
    //saves always the last end event of participants and maps participants id to end events id. Since participants ids from target model are copied 
    //from source model, this allows the transformer to append new elements to a already existing participant
    this.endeventmapping = {};
    //maps the situation scope id from source to the created targets evaluation subprocess. This allows the transformer to directly fetch the evaluation subprocess
    //from the situation scope to append sequenceflows
    this.evaluationsubprocesssituationmapping = {};
    //saves the sequenceflow id from the target model, which leads to the adaption path created by a situation scope and maps it to the that situation scope.
    //This is needed to append or change those sequence flows, if multiple adaption paths are modeled in the source model
    this.adaptflowmapping = {};
    //saves the target models end event id and maps it to the situation scope of that subprocess
    this.adaptendeventmapping = {};
    //if the adaption path is interrupting, a mechanism interrupting all other adaption paths is needed when one adaption path is finished. This is achieved
    //by a parallel gateway which appends a event based gateway, which catches messages from the other adaption paths when they finish. 
    //Since this happens dynamically when a new adaption path belonging to an already existing group of adaption paths is found, 
    //the adaption paths of situation scopes which already were appended are saved to avoid multiple
    this.alreadyappended = {};
  }
  //starting point of the transformation algorithm. It performs a depth first search of the source model and sets, depending on the defined values of the 
  //source model, the correct elements in the target model. The algorithm begins with the starting situationscope, creates a evaluation subprocess, creates the
  //execution subprocess, creates (if defined) adapt paths, and continues with appended situation scopes.
  transformModel(sourcemodel) {
    console.log(sourcemodel);

    var targetmodelstartevent = this.cli.element('StartEvent_1');
    var sourcemodeldiagramDefinitions = sourcemodel["bpmn2:definitions"];
    var sourcemodelelements = sourcemodeldiagramDefinitions["bpmn2:choreography"];
    var sourcemodelsequenceflows = sourcemodelelements[0]["bpmn2:sequenceFlow"];
    var sourcemodelparticipants = sourcemodelelements[0]["bpmn2:participant"];
    var sourcemodelsituationscopes = sourcemodelelements[0]["bpmn2:subProcess"];
    var sourcemodelstartevent = sourcemodelelements[0]["bpmn2:startEvent"][0];
    var targetmodeldiagramdefinitions = targetmodelstartevent.businessObject.$parent.$parent;
    var targetmodelrootelements = targetmodeldiagramdefinitions.rootElements || [];

    //first situationscope in the source model
    var startingSituationalScope = this.findStartingSituationalScope(sourcemodelstartevent, sourcemodelsequenceflows, sourcemodelsituationscopes);
    //evaluationprocess from the first situationscope
    var evaluationprocess = startingSituationalScope['bpmn2:subProcess'][0];
    //checks whether the first element of the evaluationprocess is a choreography task or some other element. If it is an other element, the other element
    //needs to be appended and the first chorepgraphy task is looked up
    var isfirstelementChoreography = this.checknextelement(evaluationprocess);
    var startingChoreographyTask;
    if (isfirstelementChoreography[0] === false) {
      startingChoreographyTask = this.getValidFirstChoreographyTask(evaluationprocess);
    } else {
      startingChoreographyTask = this.findStartingChoreographyTask(evaluationprocess);
    }

    //initiating participant of the initiating situation choreography
    var initiatingparticipantid = startingChoreographyTask.$.initiatingParticipantRef;
    var initiatingparticipantname;
    initiatingparticipantname = this.getParticipant(sourcemodelparticipants, initiatingparticipantid);
    //create the first participant which includes the regular path and error paths
    var participant = this.cli.append(targetmodelstartevent.id, 'bpmn:Participant');
    var participantshape = this.cli.element(participant);
    //changes the id of the target models participant to the id of the source models participant id to simplify mapping
    this.modeling.updateProperties(participantshape, { id: initiatingparticipantid });

    this.cli.setLabel(participantshape, initiatingparticipantname);
    this.lastparticipantshape = participantshape;

    //start of evaluation of situation and standard situation execution subprocess
    var isContinuePath = true;
    this.createEvaluationProcess(isContinuePath, targetmodelstartevent, startingChoreographyTask, initiatingparticipantid, sourcemodelparticipants, participantshape, targetmodelrootelements, startingSituationalScope, sourcemodelsequenceflows, sourcemodelsituationscopes, initiatingparticipantname);
    console.log(this.endeventmapping);
    console.log(this.evaluationsubprocesssituationmapping);
    console.log(this.adaptflowmapping);
    console.log(this.adaptendeventmapping);
    console.log(this.alreadyappended);
  }

  //gets the evaluationprocess from the sourcesituationscope and creates the evaluationsubprocess in the targetparticipant
  createEvaluationProcess(isContinuePath, collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, currentsituationscope, sequenceFlows, subProcesses, fittingParticipantName) {


    var sourceevaluationprocess = currentsituationscope['bpmn2:subProcess'][0];


    var targetevaluationsubprocess = this.cli.append(collabo.id, 'bpmn:SubProcess', '300,300');
    this.bpmnReplace.replaceElement(this.cli.element(targetevaluationsubprocess), {
      type: "bpmn:SubProcess",
      isExpanded: true
    });
    this.cli.setLabel(targetevaluationsubprocess, sourceevaluationprocess['$']['name']);
    var targetevaluationsubprocessshape = this.cli.element(targetevaluationsubprocess);

    var targetevaluationstartevent = this.cli.create('bpmn:StartEvent', {
      x: targetevaluationsubprocessshape.x,
      y: targetevaluationsubprocessshape.y
    }, targetevaluationsubprocessshape);

    var evaluateavailability = this.cli.append(targetevaluationstartevent, 'bpmn:Task');
    this.cli.setLabel(evaluateavailability, "Evaluate situation");

    //create participants which have to be evaluated for their situation
    var createexecutionsubprocess = false;
    var setadaptendevent = false;
    var setadaptflowelement = false;
    var interruptingprocedure = false;
    this.executeChoreographyTaskTreeWalker(sourceevaluationprocess, participants, rootElements, participantref, evaluateavailability, targetevaluationsubprocess, createexecutionsubprocess, setadaptendevent, setadaptflowelement, interruptingprocedure);
    //maps the situationscope to the evaluationsubprocess
    this.evaluationsubprocesssituationmapping[currentsituationscope['$']['id']] = targetevaluationsubprocessshape;
    //returns the element before the endevent of the evaluationsubprocess (endevent gets deleted)
    var lastelement = this.getLastElementOfParticipantBeforeEndEvent(targetevaluationsubprocess);

    //evaluationcycle to evaluate whether all necessary situation elements are provided
    var evaluationgateway = this.cli.append(lastelement, 'bpmn:ExclusiveGateway');
    var endeval = this.cli.append(evaluationgateway, 'bpmn:EndEvent');
    var continuepath;

    //creates the subprocess of the execution part of the source situationscope
    var executionsubprocess = this.cli.append(targetevaluationsubprocess, 'bpmn:SubProcess', '300,300');
    this.bpmnReplace.replaceElement(this.cli.element(executionsubprocess), {
      type: "bpmn:SubProcess",
      isExpanded: true
    });
    var executionsubprocessshape = this.cli.element(executionsubprocess);
    //console.log(this.cli.element(evaluationSubprocessShape));
    this.cli.setLabel(executionsubprocess, currentsituationscope['$']['name']);
    var executionsubprocessstartevent = this.cli.create('bpmn:StartEvent', {
      x: executionsubprocessshape.x,
      y: executionsubprocessshape.y
    }, executionsubprocessshape);
    createexecutionsubprocess = true;
    setadaptendevent = false;
    setadaptflowelement = false;
    interruptingprocedure = false;
    this.executeChoreographyTaskTreeWalker(currentsituationscope, participants, rootElements, participantref, executionsubprocessstartevent, executionsubprocess, createexecutionsubprocess, setadaptendevent, setadaptflowelement, interruptingprocedure);
    var executionsubprocessend = this.cli.append(executionsubprocess, 'bpmn:EndEvent');
    //save the mapping of endevent to the participant
    this.endeventmapping[participantref] = executionsubprocessend;

    //evaluation whether wait path or running compensate paths exist. This is needed since adaption paths can be either wait or running compensate type
    //and both of these require different case handling
    var waitpathexists = false;
    var runningcompensatepathexists = false;

    var appendingsituationalscopes = currentsituationscope['bpmn2:outgoing'];
    if (typeof appendingsituationalscopes !== 'undefined') {
      for (var sfs = 0; sfs < appendingsituationalscopes.length; sfs++) {
        for (var allsfs = 0; allsfs < sequenceFlows.length; allsfs++) {
          if (appendingsituationalscopes[sfs] === sequenceFlows[allsfs]['$']['id']) {
            if (sequenceFlows[allsfs]['$']['conditionType'] !== 'undefined') {
              if (sequenceFlows[allsfs]['$']['conditionType'] === "WaitCondition") {
                waitpathexists = true;
              } else if (sequenceFlows[allsfs]['$']['conditionType'] === "RunningCompensateCondition") {
                runningcompensatepathexists = true;
              }
            }
          }
        }
      }
    }
    //creates the wait path if an adaption path is wait type
    if (waitpathexists) {
      var iswaitpath = true;
      continuepath = this.createwaitcompensationpath(currentsituationscope, evaluationgateway, evaluateavailability, targetevaluationsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);

    }
    //creates the running compensate path if an adaption path is running compensate type
    if (runningcompensatepathexists) {
      var iswaitpath = false;
      continuepath = this.createrunningcompensationpath(currentsituationscope, executionsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    }
    //more case handling is needed for other condition cases than "Adapt" (for "Return", "Abort" and "Retry"). The case of "Continue" is an default case which skips the creation of wait and running compensate paths
    if (currentsituationscope['$']['sitscope:entryCondition'] === "Return" || currentsituationscope['$']['sitscope:entryCondition'] === "Abort" || currentsituationscope['$']['sitscope:entryCondition'] === "Retry") {
      var iswaitpath = true;
      continuepath = this.createwaitcompensationpath(currentsituationscope, evaluationgateway, evaluateavailability, targetevaluationsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    } else if (currentsituationscope['$']['sitscope:runningCompensateCondition'] === "Return" || currentsituationscope['$']['sitscope:runningCompensateCondition'] === "Abort" || currentsituationscope['$']['sitscope:runningCompensateCondition'] === "Retry") {
      var iswaitpath = false;
      continuepath = this.createrunningcompensationpath(currentsituationscope, executionsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    } else {
      var iswaitpath = false;
      this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    }







  }

  createwaitcompensationpath(currentsituationscope, evaluationgateway, evaluateavailability, evaluationSubprocessShape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath) {
    //if waitfor entry is set true, a boundary event with a timer is needed
    if (currentsituationscope['$']['sitscope:waitforentry'] === "true") {
      this.cli.connect(evaluationgateway, evaluateavailability, 'bpmn:SequenceFlow', '150,0');
      //creates a timer event boundary event which is attached to the subprocessshape. First it changes the businessobject, then the shape
      var boundary = this.cli.create('bpmn:BoundaryEvent', {
        x: evaluationSubprocessShape.x + evaluationSubprocessShape.width,
        y: evaluationSubprocessShape.y + 70
      }, evaluationSubprocessShape, true);
      var boundaryShape = this.cli.element(boundary);
      var edef = this.bpmnFactory.create('bpmn:EventDefinition');
      this.modeling.updateProperties(boundaryShape, {
        eventDefinitions: []
      });
      var newCondition = this.moddle.create('bpmn:FormalExpression', {
        body: currentsituationscope['$']['sitscope:entryConditionWait']
      });
      var newdef = this.bpmnFactory.create('bpmn:TimerEventDefinition', {
        timeDuration: newCondition
      });
      boundaryShape.businessObject.eventDefinitions.push(newdef);
      this.bpmnReplace.replaceElement(boundaryShape, {
        type: "bpmn:BoundaryEvent",
        eventDefinitionType: "bpmn:TimerEventDefinition",
      });
      this.cli.setLabel(boundary, currentsituationscope['$']['sitscope:entryConditionWait']);
      //sets the right gatewaytype depending on the adaption strategy. Then it looks for appended situationscopes and appends adaption paths to the gateway
      if (currentsituationscope['$']['sitscope:entryCondition'] === "Adapt") {
        var adaptiondecision;
        if (currentsituationscope['$']['sitscope:adaptionStrategy'] === "AllFit") {
          adaptiondecision = this.cli.append(boundary, 'bpmn:InclusiveGateway');
        }
        else {
          adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway');
        }
        continuepath = adaptiondecision;
        //find adaption situations (depth first search)
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Return") {
        var previousfittingsituation = this.getvalidpreviousSituation(currentsituationscope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: "bpmn:StartEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(boundary, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: "bpmn:EndEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Continue") {
        var firstel = evaluationSubprocessShape.outgoing[0].businessObject.targetRef.id;
        this.cli.connect(boundary, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Retry") {
        this.cli.connect(boundary, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Abort") {
        var endabort = this.cli.append(boundary, 'bpmn:EndEvent');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }
    //if waitforentry value is set false, a signal end event is set which connects to a boundary event which executes the adaption or exception path
    else if (currentsituationscope['$']['sitscope:waitforentry'] === "false") {
      var signalendevent = this.cli.append(evaluationgateway, 'bpmn:EndEvent', '0,150');
      var signalendeventshape = this.cli.element(signalendevent);
      //adaption path
      var boundary = this.cli.create('bpmn:BoundaryEvent', {
        x: evaluationSubprocessShape.x + evaluationSubprocessShape.width,
        y: evaluationSubprocessShape.y + 70
      }, evaluationSubprocessShape, true);
      var boundaryShape = this.cli.element(boundary);
      this.modeling.updateProperties(signalendeventshape, {
        eventDefinitions: []
      });
      this.modeling.updateProperties(boundaryShape, {
        eventDefinitions: []
      });
      var sign = this.bpmnFactory.create('bpmn:Signal');
      sign.name = sign.id;
      rootElements.push(sign);
      var signid = sign.id;
      var signalEventDefinition = this.bpmnFactory.create('bpmn:SignalEventDefinition', {
        signalRef: signid
      });
      var signalEventDefinition2 = this.bpmnFactory.create('bpmn:SignalEventDefinition', {
        signalRef: signid
      });
      boundaryShape.businessObject.eventDefinitions = [signalEventDefinition];
      signalendeventshape.businessObject.eventDefinitions = [signalEventDefinition2];

      this.bpmnReplace.replaceElement(signalendeventshape, {
        type: "bpmn:EndEvent",
        eventDefinitionType: "bpmn:SignalEventDefinition"
      });
      this.bpmnReplace.replaceElement(boundaryShape, {
        type: "bpmn:BoundaryEvent",
        eventDefinitionType: "bpmn:SignalEventDefinition"
      });
      //if adapt condition is set all adaption paths connected to the situationscope are evaluated and connected to the exclusive gateway
      if (currentsituationscope['$']['sitscope:entryCondition'] === "Adapt") {
        var adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway', '150,0');
        continuepath = adaptiondecision;
        //find adaption situations
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Return") {
        var previousfittingsituation = this.getvalidpreviousSituation(currentsituationscope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: "bpmn:StartEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(boundary, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: "bpmn:EndEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Continue") {
        var firstel = evaluationSubprocessShape.outgoing[0].businessObject.targetRef;
        this.cli.connect(boundary, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Retry") {
        this.cli.connect(boundary, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (currentsituationscope['$']['sitscope:entryCondition'] === "Abort") {
        var endabort = this.cli.append(boundary, 'bpmn:EndEvent');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }
    //default path which ends the waitcondition path process
    else {
      var finalend = this.cli.append(evaluationSubprocess, 'bpmn:EndEvent');
      this.endeventmapping[participantref] = finalend;
    }
    return continuepath;
  }
  //if running compensate path exists and is defined, an event subprocess is created which functions similar to the wait condition path
  createrunningcompensationpath(startingSituationalScope, executionSubprocessShape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath) {
    //creation of the event subprocess
    var participantel = this.cli.element(participantref);
    var eventsubprocess = this.cli.create('bpmn:SubProcess', {
      x: executionSubprocessShape.x + executionSubprocessShape.width + 70,
      y: executionSubprocessShape.y + 70
    }, participantel);
    this.bpmnReplace.replaceElement(this.cli.element(eventsubprocess), {
      type: "bpmn:SubProcess",
      isExpanded: true

    });
    this.bpmnReplace.replaceElement(this.cli.element(eventsubprocess), {
      type: "bpmn:SubProcess",
      triggeredByEvent: true

    });
    var eventSubprocessShape = this.cli.element(eventsubprocess);
    //start event of the eventsubprocess, which is connected to the thrown error event from the execution subprocess boundary event
    var eventsubprocessStartEvent = this.cli.create('bpmn:StartEvent', {
      x: eventSubprocessShape.x,
      y: eventSubprocessShape.y
    }, eventSubprocessShape);

    var starteventShape = this.cli.element(eventsubprocessStartEvent);
    var edefstart = this.bpmnFactory.create('bpmn:EventDefinition');
    this.modeling.updateProperties(starteventShape, {
      eventDefinitions: []
    });
    var errorEventDefinition = this.bpmnFactory.create('bpmn:ErrorEventDefinition');

    starteventShape.businessObject.eventDefinitions.push(errorEventDefinition);
    this.bpmnReplace.replaceElement(starteventShape, {
      type: "bpmn:StartEvent",
      eventDefinitionType: "bpmn:ErrorEventDefinition",
    });


    //creation of the execution subprocess boundary error event
    var boundary = this.cli.create('bpmn:BoundaryEvent', {
      x: executionSubprocessShape.x + executionSubprocessShape.width,
      y: executionSubprocessShape.y + 70
    }, executionSubprocessShape, true);
    var boundaryShape = this.cli.element(boundary);
    var edef = this.bpmnFactory.create('bpmn:EventDefinition');
    this.modeling.updateProperties(boundaryShape, {
      eventDefinitions: []
    });
    var errorEventDefinition = this.bpmnFactory.create('bpmn:ErrorEventDefinition');

    boundaryShape.businessObject.eventDefinitions.push(errorEventDefinition);
    this.bpmnReplace.replaceElement(boundaryShape, {
      type: "bpmn:BoundaryEvent",
      eventDefinitionType: "bpmn:ErrorEventDefinition",
    });
    //if waitforcompensate value is set true a timer is needed which waits for a certain time before executing the exception or adaption path
    if (startingSituationalScope['$']['sitscope:waitforcompensate'] === "true") {
      var inter = this.cli.append(eventsubprocessStartEvent, 'bpmn:IntermediateCatchEvent');
      var intershape = this.cli.element(inter);
      var edef = this.bpmnFactory.create('bpmn:EventDefinition');
      this.modeling.updateProperties(intershape, {
        eventDefinitions: []
      });
      var newCondition = this.moddle.create('bpmn:FormalExpression', {
        body: startingSituationalScope['$']['sitscope:runningCompensateConditionWait']
      });
      var newdef = this.bpmnFactory.create('bpmn:TimerEventDefinition', {
        timeDuration: newCondition
      });

      intershape.businessObject.eventDefinitions.push(newdef);
      this.bpmnReplace.replaceElement(intershape, {
        type: "bpmn:IntermediateCatchEvent",
        eventDefinitionType: "bpmn:TimerEventDefinition",
      });
      this.cli.setLabel(inter, startingSituationalScope['$']['sitscope:runningCompensateConditionWait']);
      //if adapt value is set a fitting gateway is set and adaption paths which are appended to the current situationscope are evaluated and connected to the gateway
      if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Adapt") {
        var adaptiondecision;
        if (startingSituationalScope['$']['sitscope:adaptionStrategy'] === "AllFit") {
          adaptiondecision = this.cli.append(inter, 'bpmn:InclusiveGateway');
        }
        else {
          adaptiondecision = this.cli.append(inter, 'bpmn:ExclusiveGateway');
        }
        continuepath = adaptiondecision;
        //find adaption situations
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Return") {
        var previousfittingsituation = this.getvalidpreviousSituation(startingSituationalScope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: "bpmn:StartEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(inter, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: "bpmn:EndEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Continue") {
        var firstel = executionSubprocessShape.outgoing[0].businessObject.targetRef.id;
        this.cli.connect(inter, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Retry") {
        this.cli.connect(inter, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Abort") {
        var endabort = this.cli.append(inter, 'bpmn:EndEvent');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }
    //if waitforentry value is set false, a signal end event is set which connects to a boundary event which executes the adaption or exception path
    else if (startingSituationalScope['$']['sitscope:waitforcompensate'] === "false") {
      //if adapt value is set a fitting gateway is set and adaption paths which are appended to the current situationscope are evaluated and connected to the gateway
      if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Adapt") {
        var adaptiondecision = this.cli.append(inter, 'bpmn:ExclusiveGateway', '150,0');
        continuepath = adaptiondecision;
        //find adaption situations
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Return") {
        var previousfittingsituation = this.getvalidpreviousSituation(startingSituationalScope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: "bpmn:StartEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(inter, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: "bpmn:EndEvent",
          eventDefinitionType: "bpmn:MessageEventDefinition"
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Continue") {
        var firstel = executionSubprocessShape.outgoing[0].businessObject.targetRef;
        this.cli.connect(inter, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }
      //if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Retry") {
        this.cli.connect(inter, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
      //if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === "Abort") {
        var endabort = this.cli.append(inter, 'bpmn:EndEvent');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }
    //default path which ends the running compensate condition path process
    else {
      var finalend = this.cli.append(evaluationSubprocess, 'bpmn:EndEvent');
      this.endeventmapping[participantref] = finalend;
    }
    return continuepath;
  }
  //depth first search algorithm for traversing a choreography process. First, the algorithm runs once to count the number of participants and saves all participant ids and 
  //a list for each participants, which elements from the choreography process need to be set at the participant. Next the algorithm takes the participant names and the 
  //participant element map to create the participant and the corresponding process for each participant. For this it traverses the choreography once more and if an element 
  //is in the mapping list, creates a corresponding element (choreography task to message send or receive task, gateways to gateways, events to events) and appends it to the 
  //last element. Simultaneously it maps choreography tasks to the message send and receive tasks and saves them in a map. Finally, the algorithm traverses the choreography 
  //process once more and creates the corresponding message flows. 
  //There is a difference between evaluation process, execution process and adaption path, which is implemented via switches.
  executeChoreographyTaskTreeWalker(currentsituationalscope, participants, rootElements, initiatingparticipant, startingpoint, evaluationSubprocess, createsubprocess, setadaptendevent, setadaptflowelement, executeInterruptingProcedure) {
    //names of participants and their mapping to necessary elements
    var participanthelpingstructure = this.getNumberOfParticipantsOfChorProcess(currentsituationalscope);
    var visitedparticipants = participanthelpingstructure[0];
    var visitedparticipantsarraylist = participanthelpingstructure[1];
    var currentelement;
    var participantkeys = Object.keys(visitedparticipants);
    var globalchortaskmapping = participanthelpingstructure[2];
    var eventgatewaylist = [];
    var endmessagelist = [];
    for (var i = 0; i < participantkeys.length; i++) {
      var positioningmapping = {};

      var addposition = false;
      var positioncounter = 0;
      var startingelement;
      var endingelement;
      var elementmappinglist = {};
      var stack = [];
      var visited = [];
      var output = [];
      var maxref = visitedparticipants[participantkeys[i]];
      var currentref = 0;
      var elementsofparticipant = visitedparticipantsarraylist[participantkeys[i]];

      var endeventcreated = false;
      //evaluation which element is the starting element to which the whole process needs to be appended to. If the participant is the initiating participant
      //of the choreography process, the starting point is the element which is given as a value to the procedure. If the participant has been created yet
      // a new participant is created and its start element is the starting point. Else it looks in the global participant end event mapping list and returns that
      //element.
      if (initiatingparticipant === participantkeys[i]) {
        startingelement = startingpoint;
      } else {
        var test = this.elementRegistry.get(participantkeys[i]);
        if (typeof test === 'undefined') {
          test = this.createNewParticipant(this.lastparticipantshape, rootElements, participantkeys[i]);
          var interactingParticipantShape = this.cli.element(test);
          this.lastparticipantshape = interactingParticipantShape.parent;
          var taskparticipantname = this.getParticipant(participants, participantkeys[i]);
          this.cli.setLabel(interactingParticipantShape.parent, taskparticipantname);


          startingelement = test;
        } else {

          startingelement = this.getLastElementOfParticipantBeforeEndEvent(participantkeys[i]);
        }
        //creates a subprocess if a subprocess is needed and has not been created yet
        if (createsubprocess === true) {
          var executionSubprocess = this.cli.append(startingelement, 'bpmn:SubProcess', '300,300');
          this.bpmnReplace.replaceElement(this.cli.element(executionSubprocess), {
            type: "bpmn:SubProcess",
            isExpanded: true
          });
          this.cli.setLabel(executionSubprocess, currentsituationalscope['$']['name']);

          var executionSubprocessShape = this.cli.element(executionSubprocess);
          var executionsubprocessStartEvent = this.cli.create('bpmn:StartEvent', {
            x: executionSubprocessShape.x,
            y: executionSubprocessShape.y
          }, executionSubprocessShape);
          var executionsubprocessendevent = this.cli.append(executionSubprocess, 'bpmn:EndEvent');
          this.endeventmapping[participantkeys[i]] = executionsubprocessendevent;
          startingelement = executionsubprocessStartEvent;
        }
      }
      //if the interrupting value is set for the execution, a special construct is needed. It creates a parallel gateway which creates another
      //token which goes to a event based gateway to which message receive events are appended. These message receive tasks have a corresponing
      //message send task in other participants, which are fired when the execution of their process is finished and ends all other processes in
      //the group of processes
      if (executeInterruptingProcedure === true) {
        //since a different structure already has been created in the initiating participant, the structure needs to be adapted
        if (initiatingparticipant === participantkeys[i]) {
          if (this.alreadyappended[currentsituationalscope] !== true) {
            var temp = this.cli.element(startingelement);
            var current = temp.incoming[0].source;
            this.cli.removeConnection(temp.incoming[0]);
            var parallel = this.cli.append(current, 'bpmn:ParallelGateway');
            var event = this.cli.append(parallel, 'bpmn:EventBasedGateway', '150,150');
            this.cli.connect(parallel, temp, 'bpmn:SequenceFlow');
            startingelement = temp;
            eventgatewaylist.push(event);
            this.alreadyappended[currentsituationalscope] = true;
          }
          //for all other participants it simply can be appended
        } else {
          var parallel = this.cli.append(startingelement, 'bpmn:ParallelGateway');
          var event = this.cli.append(parallel, 'bpmn:EventBasedGateway', '150,150');
          startingelement = parallel;
          eventgatewaylist.push(event);
        }

      }


      var startevent = currentsituationalscope["bpmn2:startEvent"][0];
      stack.push(startevent);
      stackloop: while (stack.length) {
        var node = stack[stack.length - 1];
        if (!visited.includes(node)) {
          var ischor = this.isChoreography(currentsituationalscope, node['$']['id']);
          for (var it = 0; it < elementsofparticipant.length; it++) {
            if (elementsofparticipant[it] === node) {
              if (!ischor) {

                positioningmapping[node['$']['id']] = 0;



              }
            }
          }
          visited.push(node);
          output.push(node);
        }

        for (var el = 0; el < Object.keys(elementmappinglist).length; el++) {
          if (node['$']['id'] === Object.keys(elementmappinglist)[el]) {
            startingelement = elementmappinglist[node['$']['id']];
          }
        }
        //all child nodes of the current node needs to be evaluated
        for (let n of node['bpmn2:outgoing']) {

          //the algorithm needs to differentiate between choreography task and different types of element
          var nextelement = this.checknextelement(currentsituationalscope, n);
          if (!this.checkforendevent(currentsituationalscope, nextelement[1])) {
            var currentevaluatedelement;
            if (nextelement[0]) {
              currentevaluatedelement = this.findChoreographyTask(currentsituationalscope, nextelement[1]);


            }
            else {
              var element = this.getTargetFromSequenceflow(currentsituationalscope, n);
              currentevaluatedelement = this.getgatewayorevent(currentsituationalscope, element);
            }
            if (!visited.includes(currentevaluatedelement)) {
              //only elements which are needed for the participant need to be treated
              for (var it = 0; it < elementsofparticipant.length; it++) {
                if (elementsofparticipant[it] === currentevaluatedelement) {
                  var finalelementid = currentevaluatedelement['$']['id'];
                  //since in some cases the algorithm for finding needed elements sometimes include elements which are not needed (due to some modelling limitations)
                  //a counter for counting the number of times a choreography task has been visited is needed. If the maximal amount of references to the choreography
                  //tasks are observed, no more elements from the source model need to be appended.
                  if (maxref > currentref) {
                    //differentiate between choreography tasks and other elements. Also some layouting is needed to improve readability of the target model
                    if (nextelement[0]) {
                      var lastvalidelement = this.getvalidpreviouselement(node, positioningmapping, currentsituationalscope);
                      var sendtaskposition_y = positioningmapping[lastvalidelement['$']['id']] * 100;
                      var sendtaskposition = '150,' + sendtaskposition_y;
                      //initiating participants need a send message task
                      if (participantkeys[i] === currentevaluatedelement['$']['initiatingParticipantRef']) {
                        var adaptionsendmessagetask = this.cli.append(startingelement, 'bpmn:SendTask', sendtaskposition);
                        startingelement = adaptionsendmessagetask;
                        elementmappinglist[finalelementid] = adaptionsendmessagetask;
                        var mappingsend = [adaptionsendmessagetask, true];
                        globalchortaskmapping[finalelementid].push(mappingsend);
                        if (setadaptflowelement === true) {
                          var adaptionmessagetaskshape = this.cli.element(adaptionsendmessagetask);
                          this.adaptflowmapping[adaptionmessagetaskshape.incoming[0].id] = currentsituationalscope;
                          setadaptflowelement = false;
                        }

                        //other participants need a receive message task
                      } else {
                        var adaptionreceivemessagetask = this.cli.append(startingelement, 'bpmn:ReceiveTask', sendtaskposition);
                        startingelement = adaptionreceivemessagetask;
                        elementmappinglist[finalelementid] = adaptionreceivemessagetask;
                        var mappingreceive = [adaptionreceivemessagetask, false];
                        globalchortaskmapping[finalelementid].push(mappingreceive);
                        if (setadaptflowelement === true) {
                          var adaptionmessagetaskshape = this.cli.element(adaptionreceivemessagetask);
                          this.adaptflowmapping[adaptionmessagetaskshape.incoming[0].id] = currentsituationalscope;
                          setadaptflowelement = false;
                        }

                      }
                      currentref += 1;
                    } else {
                      var sendtaskposition_y = positioningmapping[node['$']['id']] * 100;
                      var sendtaskposition = '150,' + sendtaskposition_y;
                      var newgateway = this.appendgatewayorevent(currentsituationalscope, finalelementid, startingelement, sendtaskposition);
                      startingelement = newgateway[1];
                      elementmappinglist[finalelementid] = newgateway[1];
                      if (setadaptflowelement === true) {
                        var adaptionmessagetaskshape = this.cli.element(newgateway[1]);
                        this.adaptflowmapping[adaptionmessagetaskshape.incoming[0].id] = currentsituationalscope;
                        setadaptflowelement = false;
                      }


                    }

                    //checks if the next element in the list of relevant elements is an end event. If yes, an end event needs to be set (maybe the traverse
                    //algorithm needs some rework to include end events into the search, but issues may arise with appending new elements to already created elements)
                    if (typeof elementsofparticipant[it + 1] !== 'undefined') {
                      if (this.checkforendevent(currentsituationalscope, elementsofparticipant[it + 1]['$']['id'])) {
                        var ending = elementsofparticipant[it + 1];
                        var endelement = this.cli.append(startingelement, 'bpmn:EndEvent');
                        elementmappinglist[elementsofparticipant[it + 1]['$']['id']] = endelement;
                        if (setadaptendevent === true) {
                          var adaptionendshape = this.cli.element(endelement);
                          this.adaptendeventmapping[adaptionendshape.id] = currentsituationalscope;
                          setadaptendevent = false;
                        }
                      }
                    }
                    //if the maximal number of elements references already were observed, the next element can be discarded. Again, this issue may arise 
                    //with special cases in the source model (More precisely if the last relevant element in the evaluation of relevant elements is not directly
                    //appended to an end event)
                  } else if (maxref === currentref) {
                    for (var rem = 0; rem < elementsofparticipant.length; rem++) {
                      if (elementsofparticipant[rem]['$']['id'] === currentevaluatedelement['$']['id']) {
                        elementsofparticipant.splice(rem, 1);
                      }
                    }
                  }
                }
              }
              //some basic positionmapping for better layouting. Layouting still sucks though :(
              var isachoreography = this.isChoreography(currentsituationalscope, node['$']['id']);
              for (var otherelement = 0; otherelement < elementsofparticipant.length; otherelement++) {
                if (elementsofparticipant[otherelement] === node) {
                  if (!isachoreography) {
                    positioningmapping[node['$']['id']] = positioningmapping[node['$']['id']] + 1;
                  }
                }
              }
              //another special case which needs to be taken in account for. If the next element already has been visited 
              //and is relevant for the process, it needs to be connected via sequenceflow. This little script takes care of it
              for (let m of currentevaluatedelement['bpmn2:outgoing']) {
                var moar = this.checknextelement(currentsituationalscope, m);
                if (!this.checkforendevent(currentsituationalscope, moar[1])) {
                  var next;
                  if (moar[0]) {
                    next = this.findChoreographyTask(currentsituationalscope, moar[1]);


                  }
                  else {
                    var elem = this.getTargetFromSequenceflow(currentsituationalscope, m);
                    next = this.getgatewayorevent(currentsituationalscope, elem);
                  }
                  if (visited.includes(next)) {
                    for (var thi = 0; thi < elementsofparticipant.length; thi++) {
                      if (elementsofparticipant[thi] === next) {
                        var appendingelements = elementmappinglist[next['$']['id']];
                        var ting = this.cli.connect(startingelement, appendingelements, 'bpmn:SequenceFlow', '150,0');
                      }
                    }
                  }
                }
              }

              stack.push(currentevaluatedelement);
              continue stackloop;
            }
          }
        }
        stack.pop();
      }
      //in some very rare cases (if the endevent mapping has not been set correctly) no proper endevent exists. This snippet takes care of it
      var evaluationsubprocessshape;
      if ((typeof evaluationSubprocess !== 'undefined') && (initiatingparticipant === participantkeys[i])) {
        evaluationsubprocessshape = this.cli.element(evaluationSubprocess);

      } else {
        evaluationsubprocessshape = this.cli.element(startingelement).parent;

      }
      var hasendevent = false;
      for (var endEventIterator = 0; endEventIterator < evaluationsubprocessshape.children.length; endEventIterator++) {
        if (evaluationsubprocessshape.children[endEventIterator].type == "bpmn:EndEvent") {
          hasendevent = true;
        }
      }
      if (hasendevent === false) {
        var endelement = this.cli.append(startingelement, 'bpmn:EndEvent');
        if (setadaptendevent === true) {
          var adaptionendshape = this.cli.element(endelement);
          this.adaptendeventmapping[adaptionendshape.id] = currentsituationalscope;
          setadaptendevent = false;
        }
        for (var check = 0; check < elementsofparticipant.length; check++) {
          if (this.checkforendevent(currentsituationalscope, elementsofparticipant[check]['$']['id'])) {
            elementmappinglist[elementsofparticipant[check]['$']['id']] = endelement;

          }
        }
      }

    }
    //sets all message flows between the message tasks
    this.addmessages(currentsituationalscope, globalchortaskmapping);
    //if the interrupting value is set true, the interrupting mechanism needs to be created (message send tasks to the interrupting message receive tasks
    //of the other processes). Supports multiple ending choreography tasks ending a choreography process
    if (executeInterruptingProcedure === true) {
      var listofChoreographies = this.findlastChoreography(currentsituationalscope);
      var endelements = [];
      for (var list = 0; list < listofChoreographies.length; list++) {
        var elements = globalchortaskmapping[listofChoreographies[list]];
        var currentelement;
        if (typeof elements !== 'undefined') {
          if (elements[0][1] === false) {
            currentelement = this.cli.element(elements[0][0]);
          } else {
            currentelement = this.cli.element(elements[1][0]);
          }
        }
        var nextelement = currentelement.outgoing[0].target;
        this.cli.removeConnection(currentelement.outgoing[0]);
        var newsend = this.cli.append(currentelement, 'bpmn:SendTask', '150,150');
        this.cli.connect(newsend, nextelement, 'bpmn:SequenceFlow');
        endelements.push(newsend);
      }
      return [eventgatewaylist, endelements];
    }
  }

  //backwards breadth first search (needed if more than one choreography task in a process ends the choreography process) 
  //which finds all last choreography tasks on the same level and returns them
  findlastChoreography(situationscope) {
    var endevent = situationscope['bpmn2:endEvent'];
    var choreographies = [];
    var queue = [];
    var mapping = [];
    var checkmore = this.checkpreviouselement(situationscope, endevent[0]['bpmn2:incoming']);
    if (checkmore[0] === true) {
      choreographies.push(checkmore[1]);
    } else {
      var gate = this.getgatewayorevent(situationscope, checkmore[1]);
      queue.push(gate);
      var currentlayer = 0;
      var foundlayer = 0;
      mapping[currentlayer] = [];
      mapping[currentlayer].push(gate['$']['id']);
      while (queue.length !== 0) {
        for (let i = 0; i < queue.length; i++) {
          currentlayer++;
          mapping[currentlayer] = [];
          var node = queue.shift();
          var ischortask = this.isChoreography(situationscope, node['$']['id']);
          if (ischortask === true) {
            choreographies.push(node['$']['id']);
            var task = this.findChoreographyTask(situationscope, node['$']['id']);
            var checking = this.checkpreviouselement(situationscope, task['bpmn2:incoming']);
            if (checking[0] === true) {
              var forttask = this.findChoreographyTask(situationscope, checking[1]);
              queue.push(forttask);
            } else {
              var gate = this.getgatewayorevent(situationscope, checking[1]);
              if (typeof gate !== 'undefined') {
                queue.push(gate);
              }
            }
            mapping[currentlayer].push(checking[1]);
          } else {
            var gate = this.getgatewayorevent(situationscope, node['$']['id']);
            var incominggate = gate['bpmn2:incoming'];
            if (typeof gate !== 'undefined') {
              if (typeof incominggate !== 'undefined') {
                for (var j = 0; j < incominggate.length; j++) {
                  var checking = this.checkpreviouselement(situationscope, incominggate[j]);
                  if (checking[0] === true) {
                    var forttask = this.findChoreographyTask(situationscope, checking[1]);
                    queue.push(forttask);
                  } else {
                    var gate = this.getgatewayorevent(situationscope, checking[1]);
                    if (typeof gate !== 'undefined') {

                      queue.push(gate);
                    }
                  }
                  mapping[currentlayer].push(checking[1]);

                }
              }
            }
          }
        }
      }
    }
    return choreographies;
  }


  //returns an element before the current element node for layouting issues (to avoid overlapping positioning in some cases). A valid element is an element
  //which already has been positioned 
  getvalidpreviouselement(node, positioningmapping, situationscope) {
    var lastvalidelement = node;
    if (typeof lastvalidelement['bpmn2:incoming'] !== 'undefined') {
      if (typeof positioningmapping[lastvalidelement['$']['id']] === 'undefined') {
        var iterate = this.checkpreviouselement(situationscope, lastvalidelement['bpmn2:incoming']);
        //console.log(iterate);
        var previouselement;
        if (iterate[0]) {
          previouselement = this.findChoreographyTask(situationscope, iterate[1]);
        }
        else {
          var newelement = this.getSourceFromSequenceflow(situationscope, lastvalidelement['bpmn2:incoming']);
          previouselement = this.getgatewayorevent(situationscope, newelement);
        }
        if (typeof previouselement !== 'undefined') {
          lastvalidelement = previouselement;
          this.getvalidpreviouselement(lastvalidelement, positioningmapping, situationscope);
        }
      }
    }
    return lastvalidelement;
  }
  //returns the situationscope which has initiated the current situationscope if the Return condition has been set
  getvalidpreviousSituation(currentsituation, allsequenceflows, allsituations) {
    var lastvalidelement = currentsituation;
    if (typeof lastvalidelement['bpmn2:incoming'] !== 'undefined') {
      var previoussituation = this.getSitscopefromFlowSource(lastvalidelement['bpmn2:incoming'], allsequenceflows, allsituations);

      if (typeof previoussituation['bpmn2:incoming'] !== 'undefined') {
        if (typeof previoussituation['bpmn2:subProcess'] === 'undefined') {

          lastvalidelement = this.getvalidpreviousSituation(previoussituation, allsequenceflows, allsituations);
        } else {
          return previoussituation;
        }
      }
    }
    return lastvalidelement;
  }

  //returns a situationscope from the sequenceflowid
  getSitscopefromFlowSource(sequenceflow, allsequenceflows, allsituations) {
    var sourcereference;
    for (var seq = 0; seq < allsequenceflows.length; seq++) {
      if (allsequenceflows[seq].$.id == sequenceflow) {
        sourcereference = allsequenceflows[seq].$.sourceRef;
      }
    }
    var fittingsituation = this.findSituationalScope(allsituations, sourcereference);
    return fittingsituation;

  }
  //returns the element which is the source of the sequenceflow appended to the end event. It deletes the end event, since it is never needed
  //when using this function
  getLastElementOfParticipantBeforeEndEvent(participantname) {
    var collabo = this.cli.element(participantname);
    var partendevent;
    if (typeof this.elementRegistry.get(this.endeventmapping[participantname]) !== 'undefined') {
      var partendevent = this.cli.element(this.endeventmapping[participantname]);

    } else {
      for (var endEventIterator = 0; endEventIterator < collabo.children.length; endEventIterator++) {
        if (collabo.children[endEventIterator].type == "bpmn:EndEvent") {
          partendevent = this.cli.element(collabo.children[endEventIterator].id);
        }
      }
    }
    var lastmessagetask = this.cli.element(partendevent.incoming[0].businessObject.sourceRef.id);
    this.cli.removeShape(partendevent);
    return lastmessagetask;
  }

  //depth first search algorithm which saves the participants and their relevant elements needed in the target model
  getNumberOfParticipantsOfChorProcess(situationscope) {
    var visitedparticipants = {};
    var visitedparticipantsarraylist = {};
    var startevent = situationscope["bpmn2:startEvent"][0];
    var stack = [];
    var visited = [];
    var output = [];
    var endelement;
    var globalchortaskmapping = {};
    var listofgateways = [];
    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        visited.push(node);
        output.push(node);
      }
      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(situationscope, n);
        if (!this.checkforendevent(situationscope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(situationscope, nextelement[1]);
          }
          else {
            var element = this.getTargetFromSequenceflow(situationscope, n);
            finalelement = this.getgatewayorevent(situationscope, element);
            if (finalelement in listofgateways) {
              listofgateways.push(finalelement);
            } else {
              listofgateways = [finalelement];
            }
          }
          if (!visited.includes(finalelement)) {
            if (nextelement[0]) {
              var finalelementid = finalelement['$']['id'];
              for (let m of finalelement['bpmn2:participantRef']) {
                if (m in visitedparticipants) {
                  visitedparticipants[m] = visitedparticipants[m] + 1;
                  visitedparticipantsarraylist[m].push(finalelement);
                }
                else {
                  visitedparticipants[m] = 1;
                  visitedparticipantsarraylist[m] = [finalelement];
                }
              }
              if (finalelementid in Object.keys(globalchortaskmapping)) {
                //globalchortaskmapping[finalelementid].push(adaptionsendmessagetask);

              }
              else {
                globalchortaskmapping[finalelementid] = [];
              }
            } else {
              for (let n of Object.keys(visitedparticipants)) {
                if (n in visitedparticipantsarraylist) {
                  visitedparticipantsarraylist[n].push(finalelement);
                }
                else {
                  visitedparticipantsarraylist[n] = [finalelement];
                }
              }
            }
            stack.push(finalelement);
            continue stackloop;
          }
        } else {
          endelement = this.getEndevent(situationscope, nextelement[1]);
          for (let n of Object.keys(visitedparticipants)) {
            if (n in visitedparticipantsarraylist) {
              visitedparticipantsarraylist[n].push(endelement);
            }
            else {
              visitedparticipantsarraylist[n] = [endelement];
            }
          }
        }
      }
      stack.pop();
    }
    for (let allpart of Object.values(visitedparticipantsarraylist)) {
      var containsend = false;
      for (let element of allpart) {
        if (element === endelement) {
          containsend = true;
        }
      }
      if (containsend === false) {
        allpart.push(endelement);
      }
    }
    if (listofgateways.length) {
      for (const [key, value] of Object.entries(visitedparticipantsarraylist)) {
        for (let allgateways of listofgateways) {
          var containsgate = false;
          for (let allvalues of value) {
            if (allgateways['$']['id'] === allvalues['$']['id']) {
              containsgate = true;
            }
          }
          if (visitedparticipants[key] > 1) {
            if (containsgate === false) {
              value.push(allgateways);
            }
          }
        }
      }
    }
    return [visitedparticipants, visitedparticipantsarraylist, globalchortaskmapping];
  }

  //depth first search which takes the mapping from choreography tasks to message send and receive tasks and connects them via message flows
  addmessages(startingSituationalScope, globalmapping) {
    var startevent = startingSituationalScope["bpmn2:startEvent"][0];
    var stack = [];
    var visited = [];
    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        visited.push(node);
      }
      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(startingSituationalScope, n);
        if (!this.checkforendevent(startingSituationalScope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(startingSituationalScope, nextelement[1]);
          }
          else {
            var element = this.getTargetFromSequenceflow(startingSituationalScope, n);
            finalelement = this.getgatewayorevent(startingSituationalScope, element);
          }
          if (!visited.includes(finalelement)) {
            if (nextelement[0]) {
              var finalelementid = finalelement['$']['id'];
              var mappingarray = globalmapping[finalelementid];
              if (mappingarray[0][1] === true) {
                var send = this.cli.element(mappingarray[0][0]);
                var receive = this.cli.element(mappingarray[1][0]);
                var con = this.cli.connect(send, receive, 'bpmn:MessageFlow');
                this.cli.setLabel(con, finalelement['$']['name']);
              } else {
                var send = this.cli.element(mappingarray[1][0]);
                var receive = this.cli.element(mappingarray[0][0]);
                var con = this.cli.connect(send, receive, 'bpmn:MessageFlow');
                this.cli.setLabel(con, finalelement['$']['name']);
              }
            }
            stack.push(finalelement);
            continue stackloop;
          }
        }
      }
      stack.pop();
    }
  }

  //depth first search for the first choreography task in a situationscope
  getValidFirstChoreographyTask(startingSituationalScope) {
    var startevent = startingSituationalScope["bpmn2:startEvent"][0];
    var stack = [];
    var visited = [];

    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        visited.push(node);
      }
      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(startingSituationalScope, n);
        if (!this.checkforendevent(startingSituationalScope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(startingSituationalScope, nextelement[1]);
            return finalelement;
          }
          else {
            var element = this.getTargetFromSequenceflow(startingSituationalScope, n);
            finalelement = this.getgatewayorevent(startingSituationalScope, element);
          }
          if (!visited.includes(finalelement)) {

            stack.push(finalelement);
            continue stackloop;
          }
        }
      }
      stack.pop();
    }
    return 'undefined';
  }
  // returns the target id from a sequenceflow
  getTargetFromSequenceflow(situationalScope, sequenceflowid) {
    var sequenceflows = situationalScope["bpmn2:sequenceFlow"];
    for (var seq = 0; seq < sequenceflows.length; seq++) {
      if (sequenceflows[seq].$.id == sequenceflowid) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        return sequenceflows[seq].$.targetRef;
      }
    }
  }
  //returns the source id from a sequenceflow
  getSourceFromSequenceflow(situationalScope, sequenceflowid) {
    var sequenceflows = situationalScope["bpmn2:sequenceFlow"];
    for (var seq = 0; seq < sequenceflows.length; seq++) {
      if (sequenceflows[seq].$.id == sequenceflowid) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        return sequenceflows[seq].$.sourceRef;
      }
    }
  }

  //iterates over all appended sequenceflows and, depending on what type of sequenceflow it is (Adapt and Running or Wait condition or Continue) directs the programm
  //execution to the right function
  findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, iswaitpath) {
    //special cases are needed for wait condition or running compensate condition
    var waitorrunningpath = "";
    if (iswaitpath) {
      waitorrunningpath = "WaitCondition";
    } else {
      waitorrunningpath = "RunningCompensateCondition";
    }
    var endabortmessagelist = [];
    var eventgatewaymessagelist = [];
    var sitscopeoutgoingflows = startingSituationalScope["bpmn2:outgoing"];
    var executeInterruptingProcedure = false;

    if (typeof sitscopeoutgoingflows !== 'undefined') {
      if (startingSituationalScope['$']['sitscope:executionType'] === "Interrupting") {
        var interruptingexecutioncounter = 0;
        for (var i = 0; i < sitscopeoutgoingflows.length; i++) {
          for (var j = 0; j < sequenceFlows.length; j++) {
            if (sitscopeoutgoingflows[i] == sequenceFlows[j].$.id) {
              if ((sequenceFlows[j].$.flowtype === "Adapt") || typeof sequenceFlows[j].$.flowtype === 'undefined') {
                interruptingexecutioncounter = interruptingexecutioncounter + 1;
              }
            }
          }
        }
        if (interruptingexecutioncounter > 1) {
          executeInterruptingProcedure = true;
        }
      }
      for (var i = 0; i < sitscopeoutgoingflows.length; i++) {
        for (var j = 0; j < sequenceFlows.length; j++) {
          if (sitscopeoutgoingflows[i] == sequenceFlows[j].$.id) {
            //Adapt flow type branch. The undefined element is caused by legacy models and may be deleted later
            if ((sequenceFlows[j].$.flowtype === "Adapt") || typeof sequenceFlows[j].$.flowtype === 'undefined') {
              if (sequenceFlows[j].$.conditionType === waitorrunningpath) {
                var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);

                var setglobalendevent = false;
                var setadaptendevent = true;
                //special case for interrupting value
                if (executeInterruptingProcedure === true) {
                  var setadaptflowelement = true;
                  var eventgateway = this.executeChoreographyTaskTreeWalker(sit, participants, rootElements, fittingParticipantName, adaptiondecision, undefined, setglobalendevent, setadaptendevent, setadaptflowelement, executeInterruptingProcedure);
                  eventgatewaymessagelist.push(eventgateway[0]);
                  endabortmessagelist.push(eventgateway[1]);
                } else {
                  var setadaptflowelement = true;
                  this.executeChoreographyTaskTreeWalker(sit, participants, rootElements, fittingParticipantName, adaptiondecision, undefined, setglobalendevent, setadaptendevent, setadaptflowelement, executeInterruptingProcedure);
                }
                var fittingsequenceflow;
                for (const [key, value] of Object.entries(this.adaptflowmapping)) {
                  if (value['$']['id'] === sit['$']['id']) {
                    fittingsequenceflow = this.cli.element(key);
                  }
                }
                var conditionstring = "";
                //default case adaption path branch
                if (sit['$']['sitscope:isDefault'] === "true") {
                  conditionstring = "Default";
                  //sets name of situation adaption path
                } else {
                  var sitscopesituations = sit['sitscope:situation'];
                  var conditionstring = "${";
                  for (let currentsituation of sitscopesituations) {
                    conditionstring += currentsituation['$']['situationname'] + "==" + currentsituation['$']['situationtrigger'] + "&&";
                  }
                  if (conditionstring.substring(conditionstring.length - 2, conditionstring.length) === "&&") {
                    conditionstring = conditionstring.substring(0, conditionstring.length - 2);
                  }
                  conditionstring += "}";
                }
                var newcondition = this.moddle.create('bpmn:FormalExpression', {
                  body: conditionstring
                });
                this.modeling.updateProperties(fittingsequenceflow, {
                  conditionExpression: newcondition
                });
                this.cli.setLabel(fittingsequenceflow, conditionstring);
                if (typeof sit["bpmn2:outgoing"] !== 'undefined') {
                  this.findappendedsituationscopes(sit, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, iswaitpath);
                }
              }
            }
            //continue flow branch
            else if (sequenceFlows[j].$.flowtype === "Continue") {
              var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
              var evaluationprocess = sit['bpmn2:subProcess'][0];
              var chortask = this.findStartingChoreographyTask(evaluationprocess);
              if (typeof chortask === 'undefined') {
                var sitstartevent = evaluationprocess['bpmn2:startEvent'][0]['bpmn2:outgoing'][0];
                chortask = this.checkforchortask(evaluationprocess, sitstartevent);
              }
              var lastmessagetask = this.getLastElementOfParticipantBeforeEndEvent(chortask.$.initiatingParticipantRef);
              var isContinuePath = true;
              this.createEvaluationProcess(isContinuePath, lastmessagetask, chortask, chortask.$.initiatingParticipantRef, participants, participantshape, rootElements, sit, sequenceFlows, subProcesses, fittingParticipantName);

            }
          }
        }
      }
      //special case if interrupting value is set. Creates the interrupting message flows.
      for (var sending = 0; sending < endabortmessagelist.length; sending++) {
        if (endabortmessagelist[sending].length === 1) {
          var el = this.cli.element(endabortmessagelist[sending][0]);
          for (var out = 0; out < eventgatewaymessagelist.length; out++) {
            var currentthing = eventgatewaymessagelist[out];
            for (var inner = 0; inner < currentthing.length; inner++) {
              var innerelement = this.cli.element(currentthing[inner]);
              if (innerelement.parent !== el.parent) {
                var mess = this.cli.append(currentthing[inner], 'bpmn:ReceiveTask');
                var thisthing = this.cli.connect(endabortmessagelist[sending][0], mess, 'bpmn:MessageFlow');
                this.cli.append(mess, 'bpmn:EndEvent');
                this.cli.setLabel(thisthing, "Abort");
              }
            }
          }
          //if more than one choreography task ends the choreography process, they all need to be causal in the interruption 
        } else if (endabortmessagelist[sending].length > 1) {
          for (var out = 0; out < eventgatewaymessagelist.length; out++) {
            var currentthing = eventgatewaymessagelist[out];
            for (var inner = 0; inner < currentthing.length; inner++) {
              var innerelement = this.cli.element(currentthing[inner]);
              var currentmessage = currentthing[inner];
              var appendlist = [];
              for (var newends = 0; newends < endabortmessagelist[sending].length; newends++) {
                var messageelement = this.cli.element(endabortmessagelist[sending][newends]);
                if (innerelement.parent !== messageelement.parent) {
                  var mess = this.cli.append(currentmessage, 'bpmn:ReceiveTask');
                  appendlist.push(mess);
                  currentmessage = mess;
                }
              }

              for (var conn = 0; conn < endabortmessagelist[sending].length; conn++) {
                var messageelement = this.cli.element(endabortmessagelist[sending][conn]);
                if (innerelement.parent !== messageelement.parent) {
                  for (let moremessages of appendlist) {
                    var thisthing = this.cli.connect(endabortmessagelist[sending][conn], moremessages, 'bpmn:MessageFlow');
                    this.cli.setLabel(thisthing, "Abort");

                  }
                }
              }
              this.cli.append(currentmessage, 'bpmn:EndEvent');
            }
          }
        }
      }

    }

  }

  //check if element is a choreography task
  checkforchortask(sit, sequenceflow) {
    var situationsequenceFlows = sit["bpmn2:sequenceFlow"];
    var targetelement;
    var chortask;
    for (var seq = 0; seq < situationsequenceFlows.length; seq++) {
      if (situationsequenceFlows[seq].$.id == sequenceflow) {
        targetelement = situationsequenceFlows[seq].$.targetRef;
      }
    }
    var currentgateway = this.getgatewayorevent(sit, targetelement);
    var outgoinggatewayflows = currentgateway["bpmn2:outgoing"];
    for (var gatewayiterator = 0; gatewayiterator < outgoinggatewayflows.length; gatewayiterator++) {
      var elementcheck = this.checknextelement(sit, outgoinggatewayflows[gatewayiterator]);
      if (elementcheck[0] !== true) {
        if (this.checkforendevent(sit, elementcheck[1]) !== true) {
          this.checkforchortask(sit, outgoinggatewayflows[gatewayiterator], chortask);
        }
      } else {
        chortask = this.findChoreographyTask(sit, elementcheck[1]);
      }
    }


    return chortask;
  }

  createAllParticipantsOfSitScope(participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, situationscope, chortask, fittingsituationsequenceflow) {
    var appendedelement = adaptiondecision;
    var currentfittingsituationsequenceflow;
    //console.log(fittingsituationsequenceflow);
    var elementcheck = this.checknextelement(situationscope, fittingsituationsequenceflow);

    var currentchortask = chortask;
    //console.log(elementcheck[0]);
    //console.log(elementcheck[1]);
    currentfittingsituationsequenceflow = elementcheck[1];
    var situationsequenceflows = situationscope["bpmn2:sequenceFlow"];
    var situationendevents = situationscope["bpmn2:endEvent"];
    var choreographytasks = situationscope["bpmn2:choreographyTask"];

    if (elementcheck[0] !== true) {
      var foundchoreography;
      var foundgateway = this.appendgatewayorevent(situationscope, elementcheck[1], appendedelement);
      if (typeof foundgateway[0] !== 'undefined') {
        appendedelement = foundgateway[1];

        var gatewaysequenceflows = foundgateway[0]["bpmn2:outgoing"];
        for (var outgoingvalues = 0; outgoingvalues < gatewaysequenceflows.length; outgoingvalues++) {
          var fittingsituationsequenceflow;
          for (var i = 0; i < situationsequenceflows.length; i++) {
            // look the sequenceflow which belongs to the start event inside the situationalscope
            if (situationsequenceflows[i].$.id == gatewaysequenceflows[outgoingvalues]) {
              //console.log(situationsequenceflows[i].$.id);
              fittingsituationsequenceflow = situationsequenceflows[i].$.id;
            }
          }
          for (var i = 0; i < choreographytasks.length; i++) {
            // look for the choreography task belonging to the sequenceflow
            if (choreographytasks[i].$.id == fittingsituationsequenceflow) {
              //console.log("find it");
              foundchoreography = choreographytasks[i];
            }

          }
          //console.log(foundgateway);
          //console.log(gatewaysequenceflows[outgoingvalues]);


          this.createAllParticipantsOfSitScope(participants, fittingParticipantName, participantshape, rootElements, appendedelement, situationscope, foundchoreography, fittingsituationsequenceflow);
          //this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,appendedelement,situationscope);
        }
      } else {
        //console.log("adapt");
        var endadaptionevent = this.cli.append(appendedelement, 'bpmn:EndEvent');
      }



    } else {
      if (typeof currentchortask === 'undefined') {
        currentchortask = this.findChoreographyTask(situationscope, currentfittingsituationsequenceflow);

      }

      var taskparticipants = currentchortask["bpmn2:participantRef"];
      var taskoutgoingsequenceflows = currentchortask["bpmn2:outgoing"];
      //console.log(currentchortask);


      //console.log(chortask);
      //console.log(situationscope);
      var taskpositioncounter = 0;

      if (typeof choreographytasks !== 'undefined') {
        for (var chorincrement = 0; chorincrement < choreographytasks.length; chorincrement++) {
          if (currentchortask.$.id == choreographytasks[chorincrement].$.id) {
            for (var k = 0; k < taskparticipants.length; k++) {
              var taskparticipantname = this.getParticipant(participants, taskparticipants[k]);
              //console.log(situationscope);
              //console.log(chortask);

              //console.log(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined');
              if (taskparticipantname != fittingParticipantName) {
                if (typeof this.elementRegistry.get(taskparticipants[k]) === 'undefined') {
                  var newinteractingparticipant = this.createNewParticipant(this.lastparticipantshape, rootElements, taskparticipants[k]);
                  var newinteractingParticipantShape = this.cli.element(newinteractingparticipant);
                  //console.log(taskparticipants[k]);
                  //console.log(newinteractingParticipantShape.parent);
                  this.cli.setLabel(newinteractingParticipantShape.parent, taskparticipantname);
                  this.lastparticipantshape = newinteractingParticipantShape.parent;
                  var sendtaskposition_y = this.taskpositioncounter * 100;
                  var sendtaskposition = '150,' + sendtaskposition_y;
                  //console.log(sendtaskposition);
                  var adaptionmessagetask = this.cli.append(appendedelement, 'bpmn:SendTask', sendtaskposition);
                  this.taskpositioncounter++;
                  var adaptionreceivemessagetask = this.cli.append(newinteractingparticipant, 'bpmn:ReceiveTask', '150,0');
                  var interactionmessage = this.cli.connect(adaptionmessagetask, adaptionreceivemessagetask, 'bpmn:MessageFlow', '150,0');
                  this.cli.setLabel(interactionmessage, currentchortask.$.name);
                  //console.log("partscopes");
                  var endadaptionreceiveevent = this.cli.append(adaptionreceivemessagetask, 'bpmn:EndEvent');
                  for (var m = 0; m < taskoutgoingsequenceflows.length; m++) {
                    for (var l = 0; l < situationsequenceflows.length; l++) {
                      if (taskoutgoingsequenceflows[m] == situationsequenceflows[l].$.id) {
                        //console.log(situationsequenceflows[l].$.targetRef);

                        var foundendevent = false;
                        for (var n = 0; n < situationendevents.length; n++) {
                          if (situationsequenceflows[l].$.targetRef == situationendevents[n].$.id) {
                            foundendevent = true;
                          }
                        }
                        if (foundendevent) {
                          //console.log("Endevent");
                          var endadaptionevent = this.cli.append(adaptionmessagetask, 'bpmn:EndEvent');

                        } else {
                          var followingchoreography = this.findChoreographyTask(situationscope, situationsequenceflows[l].$.targetRef)
                          //console.log("noendevent");
                          //enable gateways and events
                          //console.log(followingchoreography);
                          this.taskpositioncounter = 0;
                          this.createAllParticipantsOfSitScope(participants, fittingParticipantName, participantshape, rootElements, adaptionmessagetask, situationscope, followingchoreography, situationsequenceflows[l].$.id);
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
  //checks if element is an endevent
  checkforendevent(sit, elementname) {
    var situationendevents = sit["bpmn2:endEvent"];
    for (var n = 0; n < situationendevents.length; n++) {
      if (elementname == situationendevents[n].$.id) {
        return true
      }
    }

  }

  //returns the endevent by endeventid
  getEndevent(sit, elementname) {
    var situationendevents = sit["bpmn2:endEvent"];
    for (var n = 0; n < situationendevents.length; n++) {
      if (elementname == situationendevents[n].$.id) {
        return situationendevents[n];
      }
    }
  }

  //returns the participantname by participantid
  getParticipant(participants, participantref) {
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].$.id == participantref) {
        return participants[i].$.name;
      }
    }

  }

  //checks if the next element is a choreographytask. If yes it returns a tuple of the choreography task and the boolean true. Else it returns undefined and false
  checknextelement(situationalScope, outgoingelement) {

    var situationchoreographytask = situationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = situationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = outgoingelement;
    var targetid;
    var foundsituationchoreographytask;
    if (typeof outgoingsituationstart === 'undefined') {
      var situationstart = situationalScope["bpmn2:startEvent"][0];
      outgoingsituationstart = situationstart["bpmn2:outgoing"][0];
    }
    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        targetid = situationsequenceFlows[i].$.targetRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == targetid) {
        return [true, targetid];
      }
    }
    if (typeof foundsituationchoreographytask === 'undefined') {
      return [false, targetid];


    }
  }
  //checks if previous element is a choreographytask and returns it
  checkpreviouselement(situationalScope, outgoingelement) {
    var situationchoreographytask = situationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = situationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = outgoingelement;
    var targetid;
    var foundsituationchoreographytask;
    //console.log("why not");
    //console.log(situationalScope);
    //console.log(outgoingsituationstart);

    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        targetid = situationsequenceFlows[i].$.sourceRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == targetid) {
        //console.log("find it");
        return [true, targetid];
      }

    }
    if (typeof foundsituationchoreographytask === 'undefined') {
      return [false, targetid];


    }
  }

  //returns the first choreographytask in a situationscope/evaluationprocess
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
        foundsituationchoreographytask = situationchoreographytask[i];
      }

    }

    return foundsituationchoreographytask;
  }
  //appends a gateway to the given element depending on the elementid (creates the corresponding gateway or event)
  appendgatewayorevent(startingSituationalScope, elementid, appendedelement, position) {
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];
    var sendtaskposition_y;
    var sendtaskposition;
    if (typeof position !== 'undefined') {
      sendtaskposition_y = this.taskpositioncounter * 100;
      sendtaskposition = '150,' + sendtaskposition_y;
    }
    else { sendtaskposition = position };
    var situationeventBasedGateway = startingSituationalScope["bpmn2:eventBasedGateway"];
    var situationcomplexGateway = startingSituationalScope["bpmn2:complexGateway"];
    var situationexclusiveGateway = startingSituationalScope["bpmn2:exclusiveGateway"];
    var situationinclusiveGateway = startingSituationalScope["bpmn2:inclusiveGateway"];
    var situationparallelGateway = startingSituationalScope["bpmn2:parallelGateway"];
    var choreographytasks = startingSituationalScope["bpmn2:choreographyTask"];
    var intermediateCatchevents = startingSituationalScope['bpmn2:intermediateCatchEvent'];
    var foundgateway;
    var newappendix;
    if (typeof situationexclusiveGateway !== 'undefined') {
      for (var n = 0; n < situationexclusiveGateway.length; n++) {
        if (situationexclusiveGateway[n].$.id == elementid) {
          foundgateway = situationexclusiveGateway[n];
          newappendix = this.cli.append(appendedelement, 'bpmn:ExclusiveGateway', sendtaskposition);
        }
      }
    }
    if (typeof situationeventBasedGateway !== 'undefined') {
      for (var n = 0; n < situationeventBasedGateway.length; n++) {
        if (situationeventBasedGateway[n].$.id == elementid) {
          foundgateway = situationeventBasedGateway[n];
          newappendix = this.cli.append(appendedelement, 'bpmn:EventBasedGateway', sendtaskposition);

        }
      }
    }
    if (typeof situationcomplexGateway !== 'undefined') {
      for (var n = 0; n < situationcomplexGateway.length; n++) {
        if (situationcomplexGateway[n].$.id == elementid) {
          foundgateway = situationcomplexGateway[n];
          newappendix = this.cli.append(appendedelement, 'bpmn:ComplexGateway', sendtaskposition);

        }
      }
    }
    if (typeof situationinclusiveGateway !== 'undefined') {
      for (var n = 0; n < situationinclusiveGateway.length; n++) {
        if (situationinclusiveGateway[n].$.id == elementid) {
          foundgateway = situationinclusiveGateway[n];
          newappendix = this.cli.append(appendedelement, 'bpmn:InclusiveGateway', sendtaskposition);

        }
      }
    }
    if (typeof situationparallelGateway !== 'undefined') {
      for (var n = 0; n < situationparallelGateway.length; n++) {
        if (situationparallelGateway[n].$.id == elementid) {
          foundgateway = situationparallelGateway[n];
          newappendix = this.cli.append(appendedelement, 'bpmn:ParallelGateway', sendtaskposition);
        }
      }
    }

    if (typeof intermediateCatchevents !== 'undefined') {
      for (var n = 0; n < intermediateCatchevents.length; n++) {
        if (intermediateCatchevents[n].$.id == elementid) {
          if (typeof intermediateCatchevents[n]['bpmn2:timerEventDefinition'] !== 'undefined') {
            foundgateway = intermediateCatchevents[n];
            newappendix = this.cli.append(appendedelement, 'bpmn:IntermediateCatchEvent', sendtaskposition);
            var newappendixshape = this.cli.element(newappendix);
            this.bpmnReplace.replaceElement(newappendixshape, {
              type: "bpmn:IntermediateCatchEvent",
              eventDefinitionType: "bpmn:TimerEventDefinition",
            });
          }
          if (typeof intermediateCatchevents[n]['bpmn2:conditionalEventDefinition'] !== 'undefined') {
            foundgateway = intermediateCatchevents[n];
            newappendix = this.cli.append(appendedelement, 'bpmn:IntermediateCatchEvent', sendtaskposition);
            var newappendixshape = this.cli.element(newappendix);

            this.bpmnReplace.replaceElement(newappendixshape, {
              type: "bpmn:IntermediateCatchEvent",
              eventDefinitionType: "bpmn:ConditionalEventDefinition",
            });
          }
          if (typeof intermediateCatchevents[n]['bpmn2:signalEventDefinition'] !== 'undefined') {
            foundgateway = intermediateCatchevents[n];
            newappendix = this.cli.append(appendedelement, 'bpmn:IntermediateCatchEvent', sendtaskposition);
            var newappendixshape = this.cli.element(newappendix);

            this.bpmnReplace.replaceElement(newappendixshape, {
              type: "bpmn:IntermediateCatchEvent",
              eventDefinitionType: "bpmn:SignalEventDefinition",
            });
          }
        }
      }

    }
    return [foundgateway, newappendix];

  }
  //returns the gateway or event object depending on the elementid
  getgatewayorevent(startingSituationalScope, elementid) {
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];

    var situationeventBasedGateway = startingSituationalScope["bpmn2:eventBasedGateway"];
    var situationcomplexGateway = startingSituationalScope["bpmn2:complexGateway"];
    var situationexclusiveGateway = startingSituationalScope["bpmn2:exclusiveGateway"];
    var situationinclusiveGateway = startingSituationalScope["bpmn2:inclusiveGateway"];
    var situationparallelGateway = startingSituationalScope["bpmn2:parallelGateway"];
    var intermediateCatchevents = startingSituationalScope["bpmn2:intermediateCatchEvent"];
    var foundgateway;
    if (typeof situationexclusiveGateway !== 'undefined') {
      for (var n = 0; n < situationexclusiveGateway.length; n++) {
        if (situationexclusiveGateway[n].$.id == elementid) {
          foundgateway = situationexclusiveGateway[n];
        }
      }
    }
    if (typeof situationeventBasedGateway !== 'undefined') {
      for (var n = 0; n < situationeventBasedGateway.length; n++) {
        if (situationeventBasedGateway[n].$.id == elementid) {
          foundgateway = situationeventBasedGateway[n];
        }
      }
    }
    if (typeof situationcomplexGateway !== 'undefined') {
      for (var n = 0; n < situationcomplexGateway.length; n++) {
        if (situationcomplexGateway[n].$.id == elementid) {
          foundgateway = situationcomplexGateway[n];
        }
      }
    }
    if (typeof situationinclusiveGateway !== 'undefined') {
      for (var n = 0; n < situationinclusiveGateway.length; n++) {
        if (situationinclusiveGateway[n].$.id == elementid) {
          foundgateway = situationinclusiveGateway[n];
        }
      }
    }
    if (typeof situationparallelGateway !== 'undefined') {
      for (var n = 0; n < situationparallelGateway.length; n++) {
        if (situationparallelGateway[n].$.id == elementid) {
          foundgateway = situationparallelGateway[n];
        }
      }
    }
    if (typeof intermediateCatchevents !== 'undefined') {
      for (var n = 0; n < intermediateCatchevents.length; n++) {
        if (intermediateCatchevents[n].$.id == elementid) {
          foundgateway = intermediateCatchevents[n];
        }
      }
    }
    return foundgateway;
  }

  //return choreography task from id
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

  //checks if element is choreography
  isChoreography(situationalscope, choreographyid) {
    var situationchoreographytask = situationalscope["bpmn2:choreographyTask"];
    var returnvalue = false;
    for (var i = 0; i < situationchoreographytask.length; i++) {
      if (situationchoreographytask[i].$.id == choreographyid) {
        returnvalue = true;
      }
    }
    return returnvalue;
  }

  //finds the starting situationscope
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

  //find situationscope by name
  findSituationalScope(sitscopes, sitscopename) {
    for (var i = 0; i < sitscopes.length; i++) {
      if (sitscopes[i].$.id == sitscopename) {
        return sitscopes[i];     
      }
    }


  }

  //creates a new participant and a matching start event, returns the endevent
  createNewParticipant(participantshape, rootElements, participantid) {
    var start = this.cli.create('bpmn:Participant', {
      x: participantshape.x + 200,
      y: participantshape.y + participantshape.height + 200
    }, participantshape.parent);
    var participantshape2 = this.cli.element(start);
    var test = this.elementRegistry.get(participantid);
    this.modeling.updateProperties(participantshape2, { id: participantid });

    var processelement = this.bpmnFactory.create('bpmn:Process');
    rootElements.push(processelement);
    participantshape2.businessObject.processRef = processelement;
    var start2 = this.cli.create('bpmn:StartEvent', {
      x: participantshape2.x,
      y: participantshape2.y
    }, participantshape2);

    return start2;
  }
}


ModelTransformer.$inject = ['bpmnjs', 'modeling', 'config',
  'eventBus', 'bpmnRenderer', 'textRenderer', 'cli', 'bpmnFactory', 'bpmnReplace', 'elementRegistry', 'moddle'];
