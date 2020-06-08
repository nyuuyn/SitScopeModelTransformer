/**
 * Copyright Camunda Services GmbH and/or licensed to Camunda Services GmbH
 * under one or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information regarding copyright
 * ownership.
 *
 * Camunda licenses this file to you under the MIT; you may not use this file
 * except in compliance with the MIT License.
 */

'use strict';

import { has, isUndefined } from 'min-dash';

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

    // incrementing counter for participant shape positioning
    this.participantshapeposition = 1;

    // last shape used when placing participants
    this.lastparticipantshape;

    // incrementing counter for task shape positioning when multiple tasks are created from outgoing gateways
    this.taskpositioncounter = 0;

    // saves always the last end event of participants and maps participants id to end events id. Since participants ids from target model are copied
    // from source model, this allows the transformer to append new elements to a already existing participant
    this.endeventmapping = {};

    // maps the situation scope id from source to the created targets evaluation subprocess. This allows the transformer to directly fetch the evaluation subprocess
    // from the situation scope to append sequenceflows
    this.evaluationsubprocesssituationmapping = {};

    // saves the sequenceflow id from the target model, which leads to the adaption path created by a situation scope and maps it to the that situation scope.
    // This is needed to append or change those sequence flows, if multiple adaption paths are modeled in the source model
    this.adaptflowmapping = {};

    // saves the target models end event id and maps it to the situation scope of that subprocess
    this.adaptendeventmapping = {};

    // if the adaption path is interrupting, a mechanism interrupting all other adaption paths is needed when one adaption path is finished. This is achieved
    // by a parallel gateway which appends a event based gateway, which catches messages from the other adaption paths when they finish.
    // Since this happens dynamically when a new adaption path belonging to an already existing group of adaption paths is found,
    // the adaption paths of situation scopes which already were appended are saved to avoid multiple
    this.alreadyappended = {};
  }


  _getMethods(obj) {
    let properties = new Set();
    let currentObj = obj;
    do {
      Object.getOwnPropertyNames(currentObj).map(item => properties.add(item));
    } while ((currentObj = Object.getPrototypeOf(currentObj)));
    return [...properties.keys()].filter(item => typeof obj[item] === 'function');
  }


  /**
   * Transforms the given Situation-Aware Choreography Model to a Situation-Aware Collaboration Model within the Editor
   * @param sitawareChorModel a BPMN Choreography Model modeled with chor-js containing Situational Scopes
   * @private
   */
  _transformModel(sitawareChorModel) {
    console.log('Received following model:');
    console.log(sitawareChorModel);

    // the elements of the situation-aware choreography model
    let sitawareChorModelDefinitions = sitawareChorModel['bpmn2:definitions'];
    let sitawareChorModelElements = sitawareChorModelDefinitions['bpmn2:choreography'];

    let cliMethods = this._getMethods(this.cli);
    let bpmnjsMethods = this._getMethods(this.bpmnjs);
    let bpmnFactoryMethods = this._getMethods(this.bpmnFactory);
    let bpmnRendererMethods = this._getMethods(this.bpmnRenderer);
    let chorModelMethods = this._getMethods(sitawareChorModel);
    let modelingMethods = this._getMethods(this.modeling);

    console.log('CLI methods: ');
    console.log(cliMethods);

    console.log('bpmnJs methods: ');
    console.log(bpmnjsMethods);

    console.log('bpmnFacMethods:');
    console.log(bpmnFactoryMethods);

    console.log('bpmnRenderer Methods :');
    console.log(bpmnRendererMethods);

    console.log('SitAware Chor Model Methods: ');
    console.log(chorModelMethods);

    console.log('Modeling Methods: ');
    console.log(modelingMethods);

    this.modeling.makeCollaboration();

    let collaborationRootElementId = this._getCollaborationId();

    this._removeAll([collaborationRootElementId]);

    console.log('Currently there are the following elements:');
    console.log(this.cli.elements());

    console.log('With the following definitions: ');
    console.log(this.bpmnjs.getDefinitions);

    // we will create the collaboration model within these elements
    let sitawareCollabModelDefinitions = this.bpmnjs.getDefinitions();
    let sitawareCollabModelElements = sitawareCollabModelDefinitions.rootElements || [];

    // let rootProcessElement = this.findRootProcess();

    // Clean up the current model in the editor
    // this._removeAll([rootProcessElement]);

    // find all participants of the model
    let participants = this._findParticipants(sitawareChorModel);
    console.log('Found following participants: ');
    console.log(participants);

    // find all available situations
    let situations = this._findSituations(sitawareChorModel);
    console.log('Found following situations: ');
    console.log(situations);

    let y_index = 1;

    // for each participant and situation we create a participant inside the new collaboration model
    for (let index = 0; index < participants.length; index++) {
      let participant = participants[index];
      this._createParticipant(participant.id, participant.name, 100, 100 * (y_index), collaborationRootElementId, sitawareCollabModelDefinitions, true);
      y_index++;
    }

    let sitawareChorModelStartEvents = this._findStartEvents(sitawareChorModel);

    console.log('Found following start events: ');
    console.log(sitawareChorModelStartEvents);

    let visited = [];
    let created = [];
    console.log('Starting choreography to collaboration walk to create tasks in participants:');
    this._choreography2collaborationWalk(sitawareChorModelStartEvents, visited, created, sitawareChorModel, sitawareCollabModelDefinitions);

    console.log('Starting to connect created tasks');
    this._transformChoreographyFlowToCollaborationFlow(created, sitawareChorModel, sitawareCollabModelDefinitions);

    console.log('Finished creating collaboration');


    console.log('Creating Situation-Aware logic:');
    for (let index = 0; index < situations.length; index++) {
      let situation = situations[index];
      console.log('Adding Situation to collaboration');
      this._createParticipant(this._createSituationId(situation.situationname), situation.situationname, 300 , 100 * (y_index), collaborationRootElementId, sitawareCollabModelDefinitions, false);
      y_index++;
    }

    this._transformSituationAwareScopes(sitawareChorModel, sitawareCollabModelDefinitions);

    //this._cleanUp();

    this._layout();

  }

  _transformSituationAwareScopes(sitawareChorModel, sitawareCollabModelDefinitions) {
    let situationalScopes = this._findSituationalScopes(sitawareChorModel);

    for (let scopeIndex = 0; scopeIndex < situationalScopes.length; scopeIndex++) {
      let situationalScope = situationalScopes[scopeIndex];
      console.log('Found following scope:');
      console.log(situationalScope);
      let entryCondition = situationalScope.$['sitscope:entryCondition'];
      let situationViolation = situationalScope.$['sitscope:situationViolation'];

      // Find the tasks of the situational scope, determine first task(s), inject entryCondition handling before the task(s)
      // find first choreography tasks in situational scope

      switch (entryCondition) {
      case 'Wait':
        this._transformSitAwareScopeToEntryWait(situationalScope, sitawareChorModel);
        break;
      case 'Abort':
        this._transformSitAwareScopeToEntryAbort(situationalScope, sitawareChorModel);
        break;
      case 'Continue':
        break;
      }

      switch (situationViolation) {
      case 'Abort':
        this._transformSitAwareScopeToViolationAbort(situationalScope, sitawareChorModel);
        break;
      }
    }
  }

  _getSituationHandlingEndTasks() {
    let elementIds = this.cli.elements();
    let result = [];
    for (let elementIdIndex = 0; elementIdIndex < elementIds.length; elementIdIndex++) {
      let element = this.cli.element(elementIds[elementIdIndex]);
      if (element.businessObject.$attrs.situationHandling == 'entryend') {
        result.push(element);
      }
    }
    return result;
  }

  _transformSitAwareScopeToViolationAbort(situationalScope, sitawareChorModel) {
    let situations = situationalScope['sitscope:situation'];

    // in the following we find the created ex gateway of the initial situation data handling and connect it with another loop over the situations and if the expected state of situations are violated we throw an error
    let partsInScope = this._findParticipantsInSituationalScope(situationalScope,sitawareChorModel);

    let participants = this._getParticipants();
    for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
      let participant = participants[participantIndex];
      if (!partsInScope.includes(participant.id)) {
        continue;
      }

      // find all ending exclusive gateway tasks of the situation handling
      let situationHandlingEndTasks = this._getSituationHandlingEndTasks();

      let relevantTasks = [];

      // fetch the tasks which belong to this participant
      for (let taskIndex = 0; taskIndex < situationHandlingEndTasks.length; taskIndex++) {
        let task = situationHandlingEndTasks[taskIndex];
        if (this._belongsToParticipant(task.id, participant)) {
          relevantTasks.push(task);
        }
      }
      if (relevantTasks.length > 0) {
        console.log('Found relevant tasks');
      }

      let situationHandling = this._addSituationAwareDatahandling(participant, situations, false);

      // connect the generated situation check loop with the end of the initial situation check
      for (let relevantTaskIndex = 0; relevantTaskIndex < relevantTasks.length; relevantTaskIndex++) {
        let relevantTask = relevantTasks[relevantTaskIndex];
        this.cli.connect(relevantTask, situationHandling.startGateway, 'bpmn:SequenceFlow', '150,0');
      }

      // add a throw event to the end of the checking loop in case the situations violate the expected values

      let throwEvent = this._addTask(participant.id, 'bpmn:IntermediateThrowEvent', 150, 150);

      this.cli.connect(situationHandling.endGateway, throwEvent, 'bpmn:SequenceFlow', '150,0');
    }
  }

  _getPredecessorCollaborationTasksOfSituationlScope(situationalScope, sitawareChorModel) {
    let predecessorChoreographyTasks = this._findPredecessorTasks(situationalScope, sitawareChorModel);

    console.log('Found following first choreography tasks:');
    console.log(predecessorChoreographyTasks);

    // find corresponding collaboration tasks
    let firstCollabTasks = [];
    for (let index = 0; index < predecessorChoreographyTasks.length; index++) {
      this._getCollaborationTasksByChoreographyRef(predecessorChoreographyTasks[index].$.id).forEach(x => firstCollabTasks.push(x));
    }
    console.log('Found following first collaboration tasks:');
    console.log(firstCollabTasks);

    if (firstCollabTasks.length > 0) {
      console.log('Found valid situational scope tasks');
    } else {
      console.log('Found invalid situational scope tasks');
    }

    return firstCollabTasks;
  }

  _getFirstCollaborationTasksOfSituationlScope(situationalScope, sitawareChorModel) {

    let firstChoreographyTasks = this._findStartTasksInSubprocess(situationalScope.$.id,sitawareChorModel);
    console.log('Found following first choreography tasks:');
    console.log(firstChoreographyTasks);

    // find corresponding collaboration tasks
    let firstCollabTasks = [];
    for (let index = 0; index < firstChoreographyTasks.length; index++) {
      this._getCollaborationTasksByChoreographyRef(firstChoreographyTasks[index].$.id).forEach(x => firstCollabTasks.push(x));
    }
    console.log('Found following first collaboration tasks:');
    console.log(firstCollabTasks);

    if (firstCollabTasks.length > 0) {
      console.log('Found valid situational scope tasks');
    } else {
      console.log('Found invalid situational scope tasks');
    }

    return firstCollabTasks;
  }

  _transformSitAwareScopeToEntryAbort(situationalScope, sitawareChorModel) {
    let situations = situationalScope['sitscope:situation'];
    let partsInScope = this._findParticipantsInSituationalScope(situationalScope,sitawareChorModel);

    let firstCollabTasks = this._getFirstCollaborationTasksOfSituationlScope(situationalScope, sitawareChorModel);
    let predecessorCollabTasks = this._getPredecessorCollaborationTasksOfSituationlScope(situationalScope, sitawareChorModel);

    // in the following we create message send and receive task with a loop, which should loop when the situation is not the expected value
    // find the participants
    let participants = this._getParticipants();
    for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
      let participant = participants[participantIndex];
      if (!partsInScope.includes(participant.id)) {
        continue;
      }

      let relevantTasks = [];
      let predTasks = [];

      // fetch the tasks which belong to this participant
      for (let taskIndex = 0; taskIndex < firstCollabTasks.length; taskIndex++) {
        let task = firstCollabTasks[taskIndex];
        if (this._belongsToParticipant(task.id, participant)) {
          relevantTasks.push(task);
        }
      }
      if (relevantTasks.length > 0) {
        console.log('Found relevant tasks');
      }

      for (let taskIndex = 0; taskIndex < predecessorCollabTasks.length; taskIndex++) {
        let task = predecessorCollabTasks[taskIndex];
        if (this._belongsToParticipant(task.id, participant)) {
          predTasks.push(task);
        }
      }
      if (predTasks.length > 0) {
        console.log('Found predecessor tasks');
      }


      this._addSituationAwareAbortHandling(relevantTasks, participant, situations, predTasks);

      // add send/receive message tasks, gateway and flows
    }
  }

  _addSituationAwareDatahandling(participant, situations, entry) {
    let sendTasks = [];
    let receiveTasks = [];
    for (let situationIndex = 0; situationIndex < situations.length; situationIndex++) {
      let situation = situations[situationIndex];

      let sitParticipant = this._getSituationParticipant(situation);

      let sendTask = this._addTask(participant.id,'bpmn:SendTask', 150, 150);
      let receiveTask = this._addTask(participant.id,'bpmn:ReceiveTask', 150, 150);
      this.cli.connect(sendTask, sitParticipant.id, 'bpmn:MessageFlow', '150,0');
      this.cli.connect(sitParticipant.id, receiveTask, 'bpmn:MessageFlow');
      this.cli.connect(sendTask, receiveTask, 'bpmn:SequenceFlow');

      this.cli.setLabel(sendTask, 'Request Situation ' + situation.$.situationname);
      this.cli.setLabel(receiveTask, 'Receive Situation ' + situation.$.situationname);

      sendTasks.push(sendTask);
      receiveTasks.push(receiveTask);
    }

    let handlingPrefix = 'entry';
    if (!entry) {
      handlingPrefix = 'violation';
    }

    let exGateway = this._addTask(participant.id,'bpmn:ExclusiveGateway', 150, 150);
    this.modeling.updateProperties(exGateway, { situationHandling: handlingPrefix + 'end' });
    let paGateway = this._addTask(participant.id,'bpmn:ParallelGateway', 150, 150);
    this.modeling.updateProperties(paGateway, { situationHandling: handlingPrefix + 'start' });

    for (let receiveTaskIndex = 0; receiveTaskIndex < receiveTasks.length; receiveTaskIndex++) {
      this.cli.connect(receiveTasks[receiveTaskIndex], exGateway, 'bpmn:SequenceFlow', '150,0');
    }


    this.cli.connect(exGateway, paGateway, 'bpmn:SequenceFlow', '150,0');

    for (let sendTaskIndex = 0; sendTaskIndex < sendTasks.length; sendTaskIndex++) {
      this.cli.connect(paGateway, sendTasks[sendTaskIndex], 'bpmn:SequenceFlow', '150,0');
    }
    return { startGateway: paGateway,
      endGateway: exGateway };
  }

  _addSituationAwareAbortHandling(relevantTasks, participant, situations, predTasks) {

    let situationDataHandling = this._addSituationAwareDatahandling(participant, situations, true);

    // add an throw exception task to the end of the data handling
    let throwEvent = this._addTask(participant.id, 'bpmn:IntermediateThrowEvent', 150, 150);
    this.cli.connect(situationDataHandling.endGateway, throwEvent, 'bpmn:SequenceFlow', '150,0');

    // connect the generated tasks via the ex- and paGateway to the relevant task and their predecessor tasks
    for (let relevantTaskIndex = 0; relevantTaskIndex < relevantTasks.length; relevantTaskIndex++) {
      let relevantTask = relevantTasks[relevantTaskIndex];
      let incomingFlows = [...relevantTask.incoming];
      let predeccessorTasks = this._getPredeccessorTasks(relevantTask);
      this.cli.connect(situationDataHandling.endGateway, relevantTask, 'bpmn:SequenceFlow', '150,0');
      /*for (let predeccessorTaskIndex = 0; predeccessorTaskIndex < predeccessorTasks.length; predeccessorTaskIndex++) {
        let predTask = predeccessorTasks[predeccessorTaskIndex];
        this.cli.connect(predTask, situationDataHandling.startGateway, 'bpmn:SequenceFlow', '150,0');
      }*/

      // remove the old sequence flows
      /*for (let incomingFlowIndex = 0; incomingFlowIndex < incomingFlows.length; incomingFlowIndex++) {
        if (incomingFlows[incomingFlowIndex].type.includes('SequenceFlow')) {
          this.cli.removeConnection(incomingFlows[incomingFlowIndex].id);
        }
      }*/

    }

    for (let predTaskIndex = 0; predTaskIndex < predTasks.length; predTaskIndex++) {
      let predTask = predTasks[predTaskIndex];
      let outgoingFlows = [...predTask.outgoing];
      this.cli.connect(predTask, situationDataHandling.startGateway, 'bpmn:SequenceFlow', '150,0');

      // remove the old sequence flows
      /*for (let outgoingFlowIndex = 0; outgoingFlowIndex < outgoingFlows.length; outgoingFlowIndex++) {
        if (outgoingFlows[outgoingFlowIndex].type.includes('SequenceFlow')) {
          this.cli.removeConnection(outgoingFlows[outgoingFlowIndex].id);
        }
      }*/

    }

    // remove all direct connections between the relevant and pred tasks

    let sequenceFlows = this._getSequenceFlows();
    let toRemove = [];
    for (let flowIndex = 0; flowIndex < sequenceFlows.length; flowIndex++) {
      let flow = sequenceFlows[flowIndex];
      for (let relIndex = 0; relIndex < relevantTasks.length; relIndex++) {
        for (let predIndex = 0; predIndex < predTasks.length; predIndex++) {
          if (flow.target.id == relevantTasks[relIndex].id && flow.source.id == predTasks[predIndex].id) {
            toRemove.push(flow.id);
          }
        }
      }
    }

    toRemove.forEach(x => {this.cli.removeConnection(x)});

  }

  _getSequenceFlows() {
    let result = [];
    let elementIds = this.cli.elements();
    for (let index = 0; index < elementIds.length; index++) {
      if (elementIds[index].includes('Flow')) {
        let element = this.cli.element(elementIds[index]);
        if (element.type.includes('SequenceFlow')){
          result.push(element);
        }
      }
    }
    return result;
  }


  _transformSitAwareScopeToEntryWait(situationalScope, sitawareChorModel) {
    let situations = situationalScope['sitscope:situation'];
    let partsInScope = this._findParticipantsInSituationalScope(situationalScope,sitawareChorModel);
    let firstCollabTasks = this._getFirstCollaborationTasksOfSituationlScope(situationalScope, sitawareChorModel);
    let predecessorCollabTasks = this._getPredecessorCollaborationTasksOfSituationlScope(situationalScope, sitawareChorModel);

    // in the following we create message send and receive task with a loop, which should loop when the situation is not the expected value
    // find the participants
    let participants = this._getParticipants();
    for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
      let participant = participants[participantIndex];
      if (!partsInScope.includes(participant.id)) {
        continue;
      }
      let relevantTasks = [];
      let predTasks = [];

      // fetch the tasks which belong to this participant
      for (let taskIndex = 0; taskIndex < firstCollabTasks.length; taskIndex++) {
        let task = firstCollabTasks[taskIndex];
        if (this._belongsToParticipant(task.id, participant)) {
          relevantTasks.push(task);
        }
      }
      if (relevantTasks.length > 0) {
        console.log('Found relevant tasks');
      }

      for (let taskIndex = 0; taskIndex < predecessorCollabTasks.length; taskIndex++) {
        let task = predecessorCollabTasks[taskIndex];
        if (this._belongsToParticipant(task.id, participant)) {
          predTasks.push(task);
        }
      }
      if (predTasks.length > 0) {
        console.log('Found predecessor tasks');
      }

      this._addSituationAwareWaitHandling(relevantTasks, participant, situations, predTasks);

      // add send/receive message tasks, gateway and flows
    }
  }

  _addSituationAwareWaitHandling(relevantTasks, participant, situations, predTasks) {
    let situationDataHandling = this._addSituationAwareDatahandling(participant, situations, true);

    // connect the generated tasks via the ex- and paGateway to the relevant task and their predecessor tasks
    for (let relevantTaskIndex = 0; relevantTaskIndex < relevantTasks.length; relevantTaskIndex++) {
      let relevantTask = relevantTasks[relevantTaskIndex];
      let incomingFlows = [...relevantTask.incoming];
      let predeccessorTasks = this._getPredeccessorTasks(relevantTask);
      this.cli.connect(situationDataHandling.endGateway, relevantTask, 'bpmn:SequenceFlow', '150,0');
      /*for (let predeccessorTaskIndex = 0; predeccessorTaskIndex < predeccessorTasks.length; predeccessorTaskIndex++) {
        let predTask = predeccessorTasks[predeccessorTaskIndex];
        this.cli.connect(predTask, situationDataHandling.startGateway, 'bpmn:SequenceFlow', '150,0');
      }*/

      // remove the old sequence flows


    }

    for (let predTaskIndex = 0; predTaskIndex < predTasks.length; predTaskIndex++) {
      let predTask = predTasks[predTaskIndex];
      let outgoingFlows = [...predTask.outgoing];
      this.cli.connect(predTask, situationDataHandling.startGateway, 'bpmn:SequenceFlow', '150,0');

      // remove the old sequence flows


    }

    let sequenceFlows = this._getSequenceFlows();
    let toRemove = [];
    for (let flowIndex = 0; flowIndex < sequenceFlows.length; flowIndex++) {
      let flow = sequenceFlows[flowIndex];
      for (let relIndex = 0; relIndex < relevantTasks.length; relIndex++) {
        for (let predIndex = 0; predIndex < predTasks.length; predIndex++) {
          if (flow.target.id == relevantTasks[relIndex].id && flow.source.id == predTasks[predIndex].id) {
            toRemove.push(flow.id);
          }
        }
      }
    }

    toRemove.forEach(x => {this.cli.removeConnection(x);});
  }

  _getPredeccessorTasks(task) {
    let result = [];
    task.incoming.forEach(x => {
      if (x.type.includes('SequenceFlow')){
        result.push(x.source);
      }
    });
    return result;
  }

  _findPredecessorTasks(task,choreographyModel) {
    let result = []
    let incomingSequenceFlows = [];
    task['bpmn2:incoming'].forEach(x => {
      incomingSequenceFlows.push(x);
    });

    for (let index = 0; index < incomingSequenceFlows.length; index++) {
      let incomingSequenceFlow = this._findObjById(incomingSequenceFlows[index], choreographyModel);
      let sourceRef = incomingSequenceFlow.$.sourceRef;
      let sourceTask = this._findObjById(sourceRef, choreographyModel);
      if (sourceTask) {
        result.push(sourceTask);
      }
    }

    return result;
  }

  _cleanUp() {
    let elementIds = this.cli.elements();
    for (let elementIdIndex = 0 ; elementIdIndex < elementIds.length; elementIdIndex++) {
      let elementId = elementIds[elementIdIndex];
      // remove edges that are single loops
      if (elementId.includes('Flow')) {
        let flowElement = this.cli.element(elementId);
        if (flowElement.source.id == flowElement.target.id) {
          this.cli.removeConnection(elementId);
        }
      }
    }
  }


  _transformChoreographySeqFlowToCollaborationSeqFlow(sequenceFlow, participant, sitawareChorModel, sitawareCollabModel) {
    let sourceIds = [];
    let targetIds = [];
    let alreadyCheckedSourceIds = [];
    let alreadyCheckedTargetIds = [];

    sourceIds.push(sequenceFlow.sourceRef);
    targetIds.push(sequenceFlow.targetRef);

    let sourceTasks = [];
    let targetTasks = [];

    while (sourceIds.length != 0) {
      let sourceId = sourceIds.pop();
      alreadyCheckedSourceIds.push(sourceId);
      let currentChoreoTasks = [];
      if (this._isSubprocess(sourceId)) {
        this._findEndTasksInSubprocess(sourceId,sitawareChorModel).forEach(x => {currentChoreoTasks.push(x);});
      } else {
        this._findTasks(sourceId,sitawareChorModel).forEach(x => {currentChoreoTasks.push(x);});
      }

      // check if the found tasks are in the participant if not add its Id to the sourceIds
      for (let choreoTasksIndex = 0; choreoTasksIndex < currentChoreoTasks.length; choreoTasksIndex++) {
        let currentChoreoTask = currentChoreoTasks[choreoTasksIndex];
        let currentCollabTasks = this._getCollaborationTasksByChoreographyRef(currentChoreoTask.$.id);
        currentCollabTasks = this._filterChoreographyTasksToCollaborationParticipant(currentCollabTasks, participant);

        if (currentCollabTasks.length == 0) {

          // at this point we didn't find a task collab task which is also in the choreography, which means this participant doesn't work with the choreography task => find the next
          this._findPreviousTasks(currentChoreoTask, sitawareChorModel).forEach(x => {if (!alreadyCheckedSourceIds.includes(x.$.id)) {sourceIds.push(x.$.id);}});
        } else {
          currentCollabTasks.forEach(x => {sourceTasks.push(x);});
        }

      }
    }

    while (targetIds.length != 0) {
      let targetId = targetIds.pop();
      alreadyCheckedTargetIds.push(targetId);
      let currentChoreoTasks = [];
      if (this._isSubprocess(targetId)) {
        this._findStartTasksInSubprocess(targetId,sitawareChorModel).forEach(x => {currentChoreoTasks.push(x);});
      } else {
        this._findTasks(targetId,sitawareChorModel).forEach(x => {currentChoreoTasks.push(x);});
      }

      // check if the found tasks are in the participant if not add its Id to the targetIds
      for (let choreoTasksIndex = 0; choreoTasksIndex < currentChoreoTasks.length; choreoTasksIndex++) {
        let currentChoreoTask = currentChoreoTasks[choreoTasksIndex];
        let currentCollabTasks = this._getCollaborationTasksByChoreographyRef(currentChoreoTask.$.id);
        currentCollabTasks = this._filterChoreographyTasksToCollaborationParticipant(currentCollabTasks, participant);

        if (currentCollabTasks.length == 0) {

          // at this point we didn't find a task collab task which is also in the choreography, which means this participant doesn't work with the choreography task => find the next
          this._findNextTasks(currentChoreoTask, sitawareChorModel).forEach(x => {if (!alreadyCheckedTargetIds.includes(x.$.id)) {targetIds.push(x.$.id);}});
        } else {
          currentCollabTasks.forEach(x => {targetTasks.push(x);});
        }

      }
    }

    if ((sourceTasks.length != 0) && (targetTasks.length != 0)) {
      console.log('Found sourceTasks and targetTasks');
      for (let sourceIndex = 0; sourceIndex < sourceTasks.length; sourceIndex++) {
        for (let targetIndex = 0; targetIndex < targetTasks.length; targetIndex++) {
          console.log('Connecting sourceTask');
          console.log(sourceTasks[sourceIndex]);
          console.log('with targetTask');
          console.log(targetTasks[targetIndex]);
          this.cli.connect(sourceTasks[sourceIndex], targetTasks[targetIndex], 'bpmn:SequenceFlow', '150,0');
        }
      }

    } else {
      console.log('Some sourceTasks and targetTasks were not found');
      console.log('Found following sourceTasks:');
      console.log(sourceTasks);
      console.log('Found following targetTasks:');
      console.log(targetTasks);
    }



  }

  _transformChoreographyFlowToCollaborationFlow(created, sitawareChorModel, sitawareCollabModelDefinitions) {
    let sequenceFlows = this._findSequenceFlows(sitawareChorModel);
    let collabParticipants = this._getParticipants();

    // for each participant we apply the sequence flows of the given choreography model
    for (let participantIndex = 0; participantIndex < collabParticipants.length; participantIndex++) {
      let participant = collabParticipants[participantIndex];
      for (let flowIndex = 0; flowIndex < sequenceFlows.length; flowIndex++) {

        // So the problem here is:
        // the sequenceflow we try to transform here can target different task which have to be handled differently based on their type AND
        // if the task it is referencing is NOT in the participants flow, as it is not a task of the participant itself

        let sequenceFlow = sequenceFlows[flowIndex];
        let sourceId = sequenceFlow.sourceRef;
        let targetId = sequenceFlow.targetRef;

        let sourceParentSubprocess = this._findParentSubprocessById(sourceId, sitawareChorModel);
        let targetParentSubprocess = this._findParentSubprocessById(targetId, sitawareChorModel);

        // if the sequenceflow is inside a subprocess, and it's referencing either a start or end event we just skip it, as these events should not be inside a participants flow
        if (sourceParentSubprocess || targetParentSubprocess) {
          if (this._isStartEvent(sourceId) || this._isStartEvent(targetId) || this._isEndEvent(sourceId) || this._isEndEvent(targetId)) {
            continue;
          }
        }

        console.log('Fuck, im handling this sequence flow now:');
        console.log(sequenceFlow);

        this._transformChoreographySeqFlowToCollaborationSeqFlow(sequenceFlow, participant, sitawareChorModel,sitawareCollabModelDefinitions);
      }
    }


  }

  _isStartEvent(taskId) {
    return taskId.includes('StartEvent');
  }

  _isEndEvent(taskId) {
    return taskId.includes('EndEvent');
  }


  _filterChoreographyTasksToCollaborationParticipant(tasks, participant) {
    let result = [];

    for (let index = 0; index < tasks.length; index++) {
      let id = tasks[index].id;
      if (id == undefined) {
        id = tasks[index].$.id;
      }

      if (this._belongsToParticipant(id, participant)) {
        result.push(this.cli.element(id));
      }
    }

    return result;
  }

  _getMessageFlows() {
    let result = [];
    let elementIds = this.cli.elements();
    for (let elementIdIndex = 0; elementIdIndex < elementIds.length; elementIdIndex++) {
      let elementId = elementIds[elementIdIndex];
      if (elementId.includes('Flow')) {
        let element = this.cli.element(elementId);
        if (element.type == 'bpmn:MessageFlow') {
          result.push(element);
        }
      }
    }

    return result;
  }

  _layoutParticipants(dagre) {
    let participants = this._getParticipants();
    let situationParticipants = this._getSituationParticipants();

    let tasks = [];
    participants.forEach(x => tasks.push(x));
    situationParticipants.forEach(x => tasks.push(x));
    let messageFlows = this._getMessageFlows();

    let flows = [];

    for (let messageFlowIndex = 0; messageFlowIndex < messageFlows.length; messageFlowIndex++) {
      let messageFlow = messageFlows[messageFlowIndex];
      let source = messageFlow.source;
      let target = messageFlow.target;
      let sourceId = '';
      let targetId = '';

      if (!source.id.includes('Participant') && !source.id.includes('Situation')) {
        let participant = this._getParentParticipant(source);
        sourceId = participant.id;
      } else {
        sourceId = source.id;
      }

      if (!target.id.includes('Participant') && !target.id.includes('Situation')) {
        let participant = this._getParentParticipant(target);
        targetId = participant.id;
      } else {
        targetId = target.id;
      }

      flows.push({ source: sourceId, target: targetId , id: messageFlow.id });
    }


    this._layoutWithDagre(dagre, tasks, flows, { });
  }

  _layoutWithDagre(dagre, tasks, flows, options) {

    var g = new dagre.graphlib.Graph();

    // Set an object for the graph label
    g.setGraph(options);

    // Default to assigning a new object as a label for each new edge.
    //g.setDefaultEdgeLabel(function() { return {}; });

    tasks.forEach(x => {g.setNode(x.id, { label: x.id, width: x.width, height: x.height });});



    /*
    g.setNode("kspacey",    { label: "Kevin Spacey",  width: 144, height: 100 });
    g.setNode("swilliams",  { label: "Saul Williams", width: 160, height: 100 });
    g.setNode("bpitt",      { label: "Brad Pitt",     width: 108, height: 100 });
    g.setNode("hford",      { label: "Harrison Ford", width: 168, height: 100 });
    g.setNode("lwilson",    { label: "Luke Wilson",   width: 144, height: 100 });
    g.setNode("kbacon",     { label: "Kevin Bacon",   width: 121, height: 100 });
*/

    for (let flowIndex = 0; flowIndex < flows.length; flowIndex++) {
      let flow = flows[flowIndex];
      let sourceId = flow.source;
      let targetId = flow.target;
      g.setEdge(sourceId, targetId, { label: flow.id });
    }

    dagre.layout(g);

    // Participant_1mxi0ts: {"label":"Participant_1mxi0ts","width":400,"height":678,"x":1120,"y":449}

    g.nodes().forEach(v => {
      console.log('Node ' + v + ': ' + JSON.stringify(g.node(v)));
      let id = v;
      let node = g.node(v);
      let x = node.x;
      let y = node.y;
      let element = this.cli.element(id);
      let current_x = element.x;
      let current_y = element.y;
      let to_move_x = x - current_x - element.width/2;
      let to_move_y = y - current_y - element.height/2;
      let delta_string = to_move_x.toString()+','+ to_move_y.toString();
      this.cli.move(element, delta_string);
    });
    g.edges().forEach(e => {
      console.log('Edge ' + e.v + ' -> ' + e.w + ': ' + JSON.stringify(g.edge(e)));
      let edge = g.edge(e);
      let id = edge.label;
      let points = edge.points;
      let element = this.cli.element(id);
      let waypoints = element.waypoints;

      while (waypoints.length > 0) {
        waypoints.pop();
      }

      for (let pointsIndex = 0; pointsIndex < points.length; pointsIndex++) {
        let point;
        point = { x:points[pointsIndex].x, y: points[pointsIndex].y };
        waypoints.push(point);
      }

      element.waypoints = waypoints;

    });
  }

  _layout() {

    // this.modeling.distributeElements(this.cli.elements());

    var dagre = require('dagre');

    let participants = this._getParticipants();

    for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
      this._layoutParticipant(dagre, participants[participantIndex]);
    }

    this._layoutParticipants(dagre);
  }

  _layoutParticipant(dagre, participant) {

    // fetch all tasks of the participant
    let tasks = this._getParticipantTasks(participant);
    let sequenceFlows = this._getParticipantSequenceFlows(participant);
    let flows = [];
    for (let sequenceFlowIndex = 0 ; sequenceFlowIndex < sequenceFlows.length; sequenceFlowIndex++) {
      let sourceParent = this._getParentParticipant(sequenceFlows[sequenceFlowIndex].source).id;
      let targetParent = this._getParentParticipant(sequenceFlows[sequenceFlowIndex].target).id;

      if (participant.id == sourceParent && participant.id == targetParent) {
        flows.push({ source: sequenceFlows[sequenceFlowIndex].source.id, target: sequenceFlows[sequenceFlowIndex].target.id, id: sequenceFlows[sequenceFlowIndex].id });
      } else {
        console.log('Following flow references a tasks outside of the participant:');
        console.log(sequenceFlows[sequenceFlowIndex]);
      }

    }

    console.log('Starting to layout participant ' + participant.id);
    console.log(tasks);
    console.log(sequenceFlows);
    console.log(flows);
    this._layoutWithDagre(dagre,tasks, flows, { rankdir: 'LR' });
  }

  _getParticipantSequenceFlows(participant) {
    let children = participant.children;
    let result = [];

    for (let childrenIndex = 0; childrenIndex < children.length; childrenIndex++) {
      if (children[childrenIndex].type.includes('SequenceFlow')) {
        result.push(children[childrenIndex]);
      }
    }

    return result;
  }

  _getParticipantTasks(participant) {
    let children = participant.children;
    let result = [];

    for (let childrenIndex = 0; childrenIndex < children.length; childrenIndex++) {
      if (!children[childrenIndex].type.includes('SequenceFlow') && !children[childrenIndex].type.includes('MessageFlow')) {
        result.push(children[childrenIndex]);
      }
    }


    return result;
  }

  _getParentParticipant(task) {
    let participants = this._getParticipants();
    for (let partIndex = 0; partIndex < participants.length; partIndex++) {
      let participant = participants[partIndex];
      if (this._findObjById(task.id, participant)) {
        return participant;
      }
    }
    return null;
  }

  _getMaxHeight(elements) {
    let height = -1;
    for (let index = 0; index < elements.length; index++) {
      if (height < elements[index].height) {
        height = elements[index].height;
      }
    }
    return height;
  }

  _getMaxWidth(elements) {
    let width = -1;
    for (let index = 0; index < elements.length; index++) {
      if (width < elements[index].width) {
        width = elements[index].width;
      }
    }
    return width;
  }

  _createSituationId(string) {
    return 'Situation' + Date.now() +string.replace(' ', '_');
  }

  _getCollaborationId() {
    let ids = this.cli.elements();
    for (let index = 0; index < ids.length; index++) {
      if (ids[index].includes('Collaboration')) {
        return ids[index];
      }
    }
    return;
  }

  /**
   *  Walks through the given choreographyModel starting at the given set of bpmn tasks
   * @param tasks a stack of bpmn tasks which are not visited yet from the choreography model
   * @param visited a set of bpmn tasks which are alreay visited from the choreography model
   * @param created a set of bpmn tasks created within the collaboration model
   * @param choreographyModelDefinitions the choreography model to transform into a collaboration model
   * @param collaborationModelDefinitions the resulting collaboration model
   * @private
   */
  _choreography2collaborationWalk(tasks, visited, created, choreographyModelDefinitions, collaborationModelDefinitions) {

    if (tasks.length == 0) {
      return;
    }

    let currentTask = tasks.pop();
    visited.push(currentTask);

    this._transformTaskFromChoreographyToCollaboration(currentTask, choreographyModelDefinitions, collaborationModelDefinitions);

    // fetch outgoing sequence flows and therefore the next tasks
    let nextTasks = this._findNextTasks(currentTask, choreographyModelDefinitions);

    for (let index = 0; index < nextTasks.length; index++) {
      if (!visited.includes(nextTasks[index])) {
        tasks.push(nextTasks[index]);
      }
    }


    this._choreography2collaborationWalk(tasks, visited, created, choreographyModelDefinitions, collaborationModelDefinitions);
  }

  _transformTaskFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions) {
    let id = task['$'].id;

    // here we check which type of task we have and add it to each particiants process accordingly:
    if (id.startsWith('StartEvent')) {
      this._transformStartEventTaskFromChoreographyToCollaboration(task,choreographyModelDefinitions,collaborationModelDefinitions);
    } else if (id.startsWith('ChoreographyTask')) {
      this._transformChoreographyTaskFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions);
    } else if (id.startsWith('EndEvent')) {
      this._transformEndEventFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions);
    } else if (id.includes('Gateway')) {
      this._transformGatewayFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions);
    }

  }

  _transformGatewayFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions) {
    let id = task['$'].id;
    let participantIds = this._getParticipantIds();

    let taskType;

    if (id.startsWith('ExclusiveGateway')) {
      taskType = 'bpmn:ExclusiveGateway';
    } else if (id.startsWith('ParallelGateway')) {
      taskType = 'bpmn:ParallelGateway';
    }

    for (let index = 0; index < participantIds.length; index++) {
      let participantId = participantIds[index];
      let newTask = this._addTask(participantId,taskType, 150, 150);

      // add a reference to origin choreography model via an id to its original task
      this.modeling.updateProperties(newTask, { choreographyReference: task.$.id });
    }
  }

  _addTask(parentId, taskType, x,y) {
    let id = this.cli.create(taskType,{ x:x,y:y }, parentId);
    return this.cli.element(id);
  }

  _showAllElements() {
    let elementIds = this.cli.elements();
    for (let index = 0 ; index < elementIds.length; index++) {
      console.log('Showing element: ' + elementIds[index]);
      console.log(this.cli.element(elementIds[index]));
    }
  }

  _transformEndEventFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions) {
    let parentSubprocess = this._findParentSubprocess(task, choreographyModelDefinitions);
    if (!parentSubprocess) {

      // add to each participant process of the collaboration a start event for this startevent task
      let participantIds = this._getParticipantIds();
      let y_index = 1;

      for (let index = 0; index < participantIds.length; index++) {
        let participantId = participantIds[index];
        let endEventElement = this._addTask(participantId, 'bpmn:EndEvent', 150, 150 * y_index);

        // add a reference to origin choreography model via an id to its original task
        this.modeling.updateProperties(endEventElement, { choreographyReference: task.$.id });
        y_index++;
      }
    }
  }

  _transformChoreographyTaskFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions) {

    let taskName = task.$.name;
    let initiatingParticipantId = task.$.initiatingParticipantRef;
    let receivingParticipantId;

    for (let index = 0; index < task['bpmn2:participantRef'].length; index++) {
      if (task['bpmn2:participantRef'][index] !== initiatingParticipantId) {
        receivingParticipantId = task['bpmn2:participantRef'][index];
      }
    }



    // create send and receive tasks
    let sendTask = this._addTask(initiatingParticipantId, 'bpmn:SendTask', 100, 100);
    let receiveTask = this._addTask(receivingParticipantId, 'bpmn:ReceiveTask', 100, 100);

    this.cli.setLabel(sendTask, taskName);
    this.cli.setLabel(receiveTask, taskName);

    this.modeling.updateProperties(sendTask, { choreographyReference: task.$.id });
    this.modeling.updateProperties(receiveTask, { choreographyReference: task.$.id });

    this.cli.connect(sendTask, receiveTask, 'bpmn:MessageFlow');
  }

  _getCollabSuccessorTasks(task, choreographyModel) {
    let collabSuccTasks = [];
    let parentSubprocess = this._findParentSubprocess(task,choreographyModel);
    let outoingSequenceFlows;

    if (this._isSubprocess(task.$.id, choreographyModel)) {
      let startTasks = this._findStartTasksInSubprocess(task.$.id, choreographyModel);
      return startTasks;
    }

    if (parentSubprocess) {

      // if we are in a subprocess and have no incoming flows -> get flow of parent subprocess
      if (task['bpmn2:outgoing'].length == 0) {
        outoingSequenceFlows = parentSubprocess['bpmn2:outgoing'];
      } else {
        outoingSequenceFlows = task['bpmn2:outgoing'];
      }
    } else {
      outoingSequenceFlows = task['bpmn2:outgoing'];
    }

    let choreoSuccTaskIds = [];

    for (let index = 0; index < outoingSequenceFlows.length; index++) {
      let incomingSequenceFlow = this._findObjById(outoingSequenceFlows[index], choreographyModel);
      let targetRef = incomingSequenceFlow.$.targetRef;

      if (this._isSubprocess(targetRef, choreographyModel)) {
        let startTasks = this._findStartTasksInSubprocess(targetRef, choreographyModel);
        startTasks.forEach(x => {choreoSuccTaskIds.push(x.$.id);});
      } else {
        choreoSuccTaskIds.push(targetRef);
      }
    }

    for (let index = 0; index < choreoSuccTaskIds.length; index++) {
      let collabTasks = this._getCollaborationTasksByChoreographyRef(choreoSuccTaskIds[index]);
      if (collabTasks.length != 0) {
        collabTasks.forEach(x => {collabSuccTasks.push(x);});
      }
    }
    return collabSuccTasks;
  }

  /**
   * Returns the previous tasks of the given task in the current collaboration model
   * @param choreoTask a task of choreography to find its predecessors within the current collaboration model
   * @param choreographyModel the choreography model the task belongs to
   * @private
   */
  _getCollabPredecessorTasks(choreoTask, choreographyModel) {
    let collabPredTasks = [];
    let parentSubprocess = this._findParentSubprocess(choreoTask, choreographyModel);
    let incomingSequenceFlows;

    if (this._isSubprocess(choreoTask.$.id, choreographyModel)) {
      let endTasks = this._findEndTasksInSubprocess(choreoTask.$.id, choreographyModel);
      return endTasks;
    }

    if (parentSubprocess) {

      // if we are in a subprocess and have no incoming flows -> get flow of parent subprocess
      if (choreoTask['bpmn2:incoming'].length == 0) {
        incomingSequenceFlows = parentSubprocess['bpmn2:incoming'];
      } else {
        incomingSequenceFlows = choreoTask['bpmn2:incoming'];
      }
    } else {
      incomingSequenceFlows = choreoTask['bpmn2:incoming'];
    }

    let choreoPredTaskIds = [];

    for (let index = 0; index < incomingSequenceFlows.length; index++) {
      let incomingSequenceFlow = this._findObjById(incomingSequenceFlows[index], choreographyModel);
      let sourceRef = incomingSequenceFlow.$.sourceRef;

      // if
      if (this._isSubprocess(sourceRef, choreographyModel)) {
        let endTasks = this._findEndTasksInSubprocess(sourceRef, choreographyModel);
        endTasks.forEach(x => {choreoPredTaskIds.push(x.$.id);});
      } else {
        choreoPredTaskIds.push(sourceRef);
      }
    }

    for (let index = 0; index < choreoPredTaskIds.length; index++) {
      let collabTasks = this._getCollaborationTasksByChoreographyRef(choreoPredTaskIds[index]);
      if (collabTasks.length != 0) {
        collabTasks.forEach(x => {collabPredTasks.push(x);});
      }
    }
    return collabPredTasks;
  }

  _isSubprocess(taskId, choreographyModel) {

    // easy and dirty check
    if (taskId.startsWith('SituationScope') || taskId.startsWith('Subprocess') || taskId.startsWith('EvalutationProcess')) {
      return true;
    } else {
      return false;
    }
  }

  _findStartTasksInSubprocess(subprocessId, choreographyModel) {
    let subprocess = this._findObjById(subprocessId, choreographyModel);
    let startTasks = [];

    // we'll fetch the startevent tasks and then their predecessors
    let startEvents = subprocess['bpmn2:startEvent'];

    for (let index = 0; index < startEvents.length; index++) {
      let startEvent = this._findObjById(startEvents[index].$.id, choreographyModel);
      let incomingFlows = startEvent['bpmn2:outgoing'];
      for (let index2 = 0; index2 < incomingFlows.length; index2++) {
        let startTask = this._findObjById(this._findObjById(incomingFlows[index2], choreographyModel).$.targetRef, choreographyModel);
        startTasks.push(startTask);
      }

    }

    return startTasks;
  }

  _findEndTasksInSubprocess(subprocessId, choreographyModel) {
    let subprocess = this._findObjById(subprocessId, choreographyModel);
    let endTasks = [];

    // we'll fetch the endevent tasks and then their predecessors
    let endEvents = subprocess['bpmn2:endEvent'];

    for (let index = 0; index < endEvents.length; index++) {
      let endEvent = this._findObjById(endEvents[index].$.id, choreographyModel);
      let incomingFlows = endEvent['bpmn2:incoming'];
      for (let index2 = 0; index2 < incomingFlows.length; index2++) {
        let endTask = this._findObjById(this._findObjById(incomingFlows[index2], choreographyModel).$.sourceRef, choreographyModel);
        endTasks.push(endTask);
      }

    }

    return endTasks;
  }



  _getCollaborationTasksByChoreographyRef(choreographyTaskId) {

    // find task which has a choreography reference with the given id
    let elementIds = this.cli.elements();
    let elements = [];
    let collabTasks = [];

    for (let index = 0; index < elementIds.length; index++) {
      let element = this.cli.element(elementIds[index]);
      elements.push(element);
      if (element.businessObject.$attrs.choreographyReference == choreographyTaskId) {
        collabTasks.push(element);
      }

    }
    return collabTasks;
  }

  _transformStartEventTaskFromChoreographyToCollaboration(task, choreographyModelDefinitions, collaborationModelDefinitions) {
    let parentSubprocess = this._findParentSubprocess(task, choreographyModelDefinitions);
    if (!parentSubprocess) {

      // add to each participant process of the collaboration a start event for this startevent task
      let participantIds = this._getParticipantIds();
      let y_index = 1;

      for (let index = 0; index < participantIds.length; index++) {
        let participantId = participantIds[index];
        let startEventElement = this._addTask(participantId, 'bpmn:StartEvent', 150, 150 * y_index);

        // add a reference to origin choreography model via an id to its original task
        this.modeling.updateProperties(startEventElement, { choreographyReference: task.$.id });
        y_index++;
      }
    }
  }

  _getParticipantsProcesses() {
    let processIds = this._getParticipantsProcessIds();
    let result = [];
    processIds.forEach(x => {result.push(this.cli.element(x));});
    return result;
  }

  _getParticipantsProcessIds() {
    let participants = this._getParticipants();
    let result = [];
    participants.forEach(x => {result.push(x.businessObject.processRef.id);});
    return result;
  }

  _getSituationParticipantIds() {
    let result = [];
    this.cli.elements().forEach(x => {if (x.includes('Situation')) {result.push(x);}});
    return result;
  }

  _getSituationParticipants() {
    let ids = this._getSituationParticipantIds();
    let result = [];
    ids.forEach(x => {result.push(this.cli.element(x));});
    return result;
  }

  _getSituationParticipant(situation) {
    let sitParticipants = this._getSituationParticipants();
    for (let index = 0; index < sitParticipants.length; index++) {
      let sitParticipant = sitParticipants[index];
      if (sitParticipant.id.endsWith(situation.$.situationname)) {
        return sitParticipant;
      }
    }
    return null;
  }

  _findParticipantsInSituationalScope(situationalScope, sitawareChoreModel) {
    let result = [];
    let choreoTasks = situationalScope['bpmn2:choreographyTask'];

    for (let index = 0; index < choreoTasks.length; index++) {
      let choreoTask = choreoTasks[index];
      let participantRefs = choreoTask['bpmn2:participantRef'];
      for (let index2 = 0; index2 < participantRefs.length; index2++) {
        let partRef = participantRefs[index2];
        if (!result.includes(partRef)) {
          result.push(partRef);
        }
      }
    }
    return result;
  }

  _getParticipants() {
    let ids = this._getParticipantIds();
    let result = [];
    ids.forEach(x => {result.push(this.cli.element(x));});
    return result;
  }

  _getParticipantIds() {
    let result = [];
    this.cli.elements().forEach(x => {if (x.includes('Participant')) {result.push(x);}});
    return result;
  }

  _findPreviousTasks(task, choreographyModelDefinitions) {

    let sequenceFlowIds;

    if (this._isSubprocess(task.$.id,choreographyModelDefinitions)) {
      // if this task is a subprocess, its 'previous' tasks are its endtasks
      return this._findEndTasksInSubprocess(task.$.id, choreographyModelDefinitions);
    }

    // if the task has no incoming flow => start task
    if (!task.hasOwnProperty('bpmn2:incoming')) {

      // if the given task is in a subprocess => get incomging flows of the parent subprocess
      let parentSubprocess = this._findParentSubprocess(task, choreographyModelDefinitions);
      if (parentSubprocess) {
        sequenceFlowIds = parentSubprocess['bpmn2:incoming'];
      } else {
        return [];
      }
    } else {
      sequenceFlowIds = task['bpmn2:incoming'];
    }

    let previousTasks = [];

    for (let index = 0; index < sequenceFlowIds.length; index++) {
      let sequenceFlowId = sequenceFlowIds[index];
      let sequenceflow = this._findObjById(sequenceFlowId,choreographyModelDefinitions);


      let nextTaskId = sequenceflow.$.targetRef;
      let foundTasks = this._findTasks(nextTaskId, choreographyModelDefinitions);
      for (let index_3 = 0; index_3 < foundTasks.length; index_3++) {
        previousTasks.push(foundTasks[index_3]);
      }


    }

    return previousTasks;
  }

  _findNextTasks(task, choreographyModelDefinitions) {

    let sequenceFlowIds;

    if (this._isSubprocess(task.$.id, choreographyModelDefinitions)) {
      return this._findStartTasksInSubprocess(task.$.id, choreographyModelDefinitions);
    }

    // if the task has no outgoing flow => end task
    if (!task.hasOwnProperty('bpmn2:outgoing')) {

      // if the given task is in a subprocess => get outgoing flows of the parent subprocess
      let parentSubprocess = this._findParentSubprocess(task, choreographyModelDefinitions);
      if (parentSubprocess) {
        sequenceFlowIds = parentSubprocess['bpmn2:outgoing'];
      } else {
        return [];
      }
    } else {
      sequenceFlowIds = task['bpmn2:outgoing'];
    }

    let nextTasks = [];

    for (let index = 0; index < sequenceFlowIds.length; index++) {
      let sequenceFlowId = sequenceFlowIds[index];
      let sequenceflow = this._findObjById(sequenceFlowId,choreographyModelDefinitions);


      let nextTaskId = sequenceflow.$.targetRef;
      let foundTasks = this._findTasks(nextTaskId, choreographyModelDefinitions);
      for (let index_3 = 0; index_3 < foundTasks.length; index_3++) {
        nextTasks.push(foundTasks[index_3]);
      }


    }

    return nextTasks;
  }

  _findParentSubprocessById(taskId, choreographyModelDefinitions) {
    let task = this._findObjById(taskId, choreographyModelDefinitions);
    let result = this._findParentSubprocess(task, choreographyModelDefinitions);

    // if the taskId == subprocessId we found itself => not valid
    if (result == undefined) {
      return;
    } else if (taskId == result.$.id) {
      return;
    }

    return result;
  }

  _findParentSubprocess(task, choreographyModelDefinitions) {
    let subprocesses = this._findSubProcesses(choreographyModelDefinitions);
    for (let index = 0; index < subprocesses.length; index++) {
      let obj = this._findObjById(task.$.id, subprocesses[index]);
      if (obj) {
        return subprocesses[index];
      }
    }
    return;
  }

  _findTasks(id, sitawareChorModel) {
    let tasks = [];
    let obj = this._findObjById(id, sitawareChorModel);

    if (obj == undefined) {
      return tasks;
    } else {
      tasks.push(obj);
    }

    return tasks;
  }

  _findFirstTasksWithinSubprocess(subprocess) {
    let tasks = [];

    // if this subprocess has startevents, we already have them
    if (subprocess.hasOwnProperty('bpmn2:startEvent')) {
      let startEvents = subprocess['bpmn2:startEvent'];
      for (let index = 0; index < startEvents.length; index++) {
        tasks.push(startEvents[index]);
      }
    }

    // TODO allow subprocesses/situational scopes to have no start events => check for choreographyTasks without incoming sequence flows

    return tasks;
  }

  _belongsToParticipant(taskId, participant) {
    let children = participant['children'];

    for (let index = 0; index < children.length; index++) {
      if (children[index].id == taskId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Search through the object tree to find an object where it child has an 'id' attribute with the given value.
   * This is necessary as the elements of the bpmn.js model contains the element id as a child.
   * @param id the id of the bpmn element to find
   * @param obj a javascript object that is used to start the search
   * @returns {*}
   * @private
   */
  _findObjById(id, obj) {
    var result, p;
    for (p in obj) {
      if (obj.hasOwnProperty(p) && typeof obj[p] === 'object') {
        if (obj[p].id === id) {
          return obj;
        }
        result = this._findObjById(id, obj[p]);
        if (result) {
          return result;
        }
      }
    }
    return result;
  }

  /**
   * Find objects which have the given property 'property' defined starting from the given object 'obj'
   * @param property
   * @param obj
   * @returns {*}
   * @private
   */
  _findBPMNObjectsByProperty(property, obj) {
    let p;
    let result = [];
    for (p in obj) {
      if (obj.hasOwnProperty(p) && typeof obj[p] === 'object' && (p == property)) {
        result.push(obj[p]);
      }
      if (p.startsWith('bpmn2')) {
        let subresult = this._findBPMNObjectsByProperty(property, obj[p]);
        subresult.forEach(x => result.push(x));
      }
    }
    if (obj instanceof Array) {
      for (let index = 0; index < obj.length;index++) {
        let subresult = this._findBPMNObjectsByProperty(property, obj[index]);
        subresult.forEach(x => result.push(x));
      }
    }

    return result;
  }

  _findSubProcesses(sitawareChorModel) {
    let result = this._findBPMNObjectsByProperty('bpmn2:subProcess',sitawareChorModel);

    // result is an array of arrays, let's clean it
    let subprocesses = [];

    for (let index = 0; index < result.length; index++) {
      let array = result[index];
      for (let subindex = 0; subindex < array.length; subindex++) {
        subprocesses.push(array[subindex]);
      }
    }

    return subprocesses;
  }

  _findSequenceFlows(sitawareChorModel) {
    let sequenceflows_dirty = this._findChoreography(sitawareChorModel)['bpmn2:sequenceFlow'];
    let sequenceflows = [];
    let subprocesses = this._findSubProcesses(sitawareChorModel);

    for (let subprocessIndex = 0; subprocessIndex < subprocesses.length; subprocessIndex++) {
      let subprocess = subprocesses[subprocessIndex];
      subprocess['bpmn2:sequenceFlow'].forEach(x => {sequenceflows_dirty.push(x);});

    }

    for (let index = 0; index < sequenceflows_dirty.length; index++) {
      sequenceflows.push(sequenceflows_dirty[index]['$']);
    }

    return sequenceflows;
  }

  _findParticipants(sitawareChorModel) {
    let participants_dirty = this._findChoreography(sitawareChorModel)['bpmn2:participant'];
    let participants = [];

    for (let index = 0; index < participants_dirty.length; index++) {
      participants.push(participants_dirty[index]['$']);
    }

    return participants;
  }

  _findStartEvents(sitawareChorModel) {
    let startEvents = this._findChoreography(sitawareChorModel)['bpmn2:startEvent'];
    let result = [];
    startEvents.forEach(x => {result.push(x);});
    return result;
  }

  _findChoreography(sitawareChorModel) {
    return sitawareChorModel['bpmn2:definitions']['bpmn2:choreography'][0];
  }

  _findSituations(sitawareChorModel) {
    let situationalScopes = this._findSituationalScopes(sitawareChorModel);
    let result = [];

    for (let index = 0; index < situationalScopes.length; index++) {
      let situationalScope = situationalScopes[index];
      let situations = situationalScope['sitscope:situation'];
      for (let index2 = 0; index2 < situations.length; index2++) {
        result.push(situations[index2]['$']);
      }

    }
    return result;
  }

  _findSituationalScopes(sitawareChorModel) {
    let subprocesses = this._findSubProcesses(sitawareChorModel);
    let situationalScopes = [];

    for (let index = 0; index < subprocesses.length; index++) {
      if (subprocesses[index]['sitscope:situation'] !== null) {
        situationalScopes.push(subprocesses[index]);
      }
    }

    return situationalScopes;
  }

  _createParticipant(participantId, participantName, x, y, collaborationsRootElement, sitawareCollabModelDefinitions, isExecutable) {


    // processelement = this.cli.append(processelement);

    let participant = this.cli.create('bpmn:Participant', { x: x, y: y }, collaborationsRootElement);
    let participantshape = this.cli.element(participant);

    // changes the id of the target models participant to the id of the source models participant id to simplify mapping
    this.modeling.updateProperties(participantshape, { id: participantId });

    this.cli.setLabel(participantshape, participantName);


    if (isExecutable) {
      let processelement = this.bpmnFactory.create('bpmn:Process');

      // let processelement = this.cli.create('bpmn:Process', { x: x, y: y }, sitawareCollabModelDefinitions);

      sitawareCollabModelDefinitions.rootElements.push(processelement);
      participantshape.businessObject.processRef = processelement;

      // var processelement = this.cli.create('bpmn:Process', participant);
    }

  }


  // starting point of the transformation algorithm. It performs a depth first search of the source model and sets, depending on the defined values of the
  // source model, the correct elements in the target model. The algorithm begins with the starting situationscope, creates a evaluation subprocess, creates the
  // execution subprocess, creates (if defined) adapt paths, and continues with appended situation scopes.
  transformModel(sourcemodel) {
    this._transformModel(sourcemodel);
    return;

    console.log(sourcemodel);


    var sourcemodeldiagramDefinitions = sourcemodel['bpmn2:definitions'];
    var sourcemodelelements = sourcemodeldiagramDefinitions['bpmn2:choreography'];
    var sequenceflows = sourcemodelelements[0]['bpmn2:sequenceFlow'];
    var participants = sourcemodelelements[0]['bpmn2:participant'];
    var situationscopes = sourcemodelelements[0]['bpmn2:subProcess'];
    var sourcemodelstartevent = sourcemodelelements[0]['bpmn2:startEvent'][0];
    var rootProcessElement = this.findRootProcess();
    var rootDiagramElement = this.findRootDiagram(rootProcessElement);

    console.log('Found the following root process element:');
    console.log(rootProcessElement);

    console.log('Found the following diagram element: ');
    console.log(rootDiagramElement);


    this._removeAll([rootProcessElement]);

    var targetmodeldiagramdefinitions = rootProcessElement.businessObject.$parent;
    var targetmodelrootelements = targetmodeldiagramdefinitions.rootElements || [];

    this.createParticipants(participants, targetmodelrootelements);



    // first situationscope in the source model
    // var startingSituationalScope = this.findStartingSituationalScope(sourcemodelstartevent, sourcemodelsequenceflows, sourcemodelsituationscopes);
    var startingSituationalScopes = this.findSituationScopes(sourcemodelstartevent, sequenceflows, situationscopes);

    for (var i = 0; i < startingSituationalScopes.length; i++) {
      var startingSituationalScope = startingSituationalScopes[i];

      if (startingSituationalScope != null) {
        console.log('Found first situational scope');
      }

      // evaluationprocess from the first situationscope
      var evaluationprocess = startingSituationalScope['bpmn2:subProcess'][0];

      if (evaluationprocess != null) {
        console.log('Found first evaluation process');
      }

      // checks whether the first element of the evaluationprocess is a choreography task or some other element. If it is an other element, the other element
      // needs to be appended and the first chorepgraphy task is looked up
      var isfirstelementChoreography = this.checknextelement(evaluationprocess);
      var startingChoreographyTask;
      if (isfirstelementChoreography[0] === false) {
        startingChoreographyTask = this.getValidFirstChoreographyTask(evaluationprocess);
      } else {
        startingChoreographyTask = this.findStartingChoreographyTask(evaluationprocess);
      }

      // initiating participant of the initiating situation choreography
      var initiatingparticipantid = startingChoreographyTask.$.initiatingParticipantRef;
      var initiatingparticipantname;
      initiatingparticipantname = this.getParticipantName(participants, initiatingparticipantid);

      var participantshape = this.getParticipantElement(initiatingparticipantid, initiatingparticipantname);



      // var targetmodelstarteventid2 = this.cli.create('bpmn:StartEvent', { x: 200, y: 200 }, rootProcessElement);
      // console.log(targetmodelstarteventid2);

      // create the first participant which includes the regular path and error paths
      // var participant = this.cli.append(targetmodelstartevent.id, 'bpmn:Participant');
      // var participant = this.cli.append(targetmodelstartevent.id, 'bpmn:Participant');


      // changes the id of the target models participant to the id of the source models participant id to simplify mapping
      this.modeling.updateProperties(participantshape, { id: initiatingparticipantid });

      this.cli.setLabel(participantshape, initiatingparticipantname);
      this.lastparticipantshape = participantshape;

      var participantStartEventId = this.addStartEventToElement(participantshape);
      var targetmodelstartevent = this.cli.element(participantStartEventId);


      // start of evaluation of situation and standard situation execution subprocess
      var isContinuePath = true;
      this.createEvaluationProcess(isContinuePath, targetmodelstartevent, startingChoreographyTask, initiatingparticipantid, participants, participantshape, targetmodelrootelements, startingSituationalScope, sequenceflows, situationscopes, initiatingparticipantname);



      console.log(this.endeventmapping);
      console.log(this.evaluationsubprocesssituationmapping);
      console.log(this.adaptflowmapping);
      console.log(this.adaptendeventmapping);
      console.log(this.alreadyappended);
    }
  }

  /**
   * creates a new participant and a matching start event, returns the start event
   * @param participantshape
   * @param rootElements
   * @param participantid
   * @returns {bpmn:StartEvent}
   */
  createNewParticipant(participantshape, rootElements, participantid) {
    var start = this.cli.create('bpmn:Participant', {
      x: participantshape.x + 200,
      y: participantshape.y + participantshape.height + 200
    }, participantshape.parent);
    var participantshape2 = this.cli.element(start);
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

  addStartEventToElement(element) {
    var startEvent = this.cli.create('bpmn:StartEvent', { x: element.x, y: element.y }, element);
    return startEvent;
  }

  findRootProcess() {
    var elements = this.cli.elements();
    console.log(elements);
    var processElement;
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].startsWith('Process')) {
        processElement = this.cli.element(elements[i]);
        console.log(processElement);
      }
    }
    return processElement;
  }

  _removeAll(except) {
    var toRemove = [];
    var elements = this.cli.elements();
    for (var i = 0; i < elements.length; i++) {
      var element = elements[i];
      if (!except.includes(element)) {
        toRemove.push(element);
      }
    }

    for (var j = 0; j < toRemove.length; j++) {
      this.cli.removeShape(toRemove[j]);
    }
  }

  getId(elements) {
    var ids = [];
    for (var i = 0; i < elements.length; i++) {
      ids.push(elements[i].id);
    }
    return ids;
  }

  getParticipantElement(participantId) {
    return this.cli.element(participantId);
  }

  createParticipant(participantId, participantName, x, y, rootelements) {


    // processelement = this.cli.append(processelement);

    var participant = this.cli.create('bpmn:Participant', { x: x, y: y }, this.cli.elements()[0]);
    var participantshape = this.cli.element(participant);

    // changes the id of the target models participant to the id of the source models participant id to simplify mapping
    this.modeling.updateProperties(participantshape, { id: participantId });

    this.cli.setLabel(participantshape, participantName);


    var processelement = this.bpmnFactory.create('bpmn:Process');
    rootelements.push(processelement);
    participantshape.businessObject.processRef = processelement;

    // var processelement = this.cli.create('bpmn:Process', participant);
  }

  createParticipants(participants, rootelements) {
    console.log(participants);
    for (var i = 0; i < participants.length; i++) {
      this.createParticipant(participants[i].$.id, participants[i].$.name, 100 * (i + 1), 100 * (i + 1), rootelements);
    }
  }

  findRootDiagram(rootProcess) {
    var parent = rootProcess.parent;
    console.log(parent);
    return parent;
  }

  // gets the evaluationprocess from the sourcesituationscope and creates the evaluationsubprocess in the targetparticipant
  createEvaluationProcess(isContinuePath, collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, currentsituationscope, sequenceFlows, subProcesses, fittingParticipantName) {


    var sourceevaluationprocess = currentsituationscope['bpmn2:subProcess'][0];


    var targetevaluationsubprocess = this.cli.append(collabo.id, 'bpmn:SubProcess', '300,300');
    this.bpmnReplace.replaceElement(this.cli.element(targetevaluationsubprocess), {
      type: 'bpmn:SubProcess',
      isExpanded: true
    });
    this.cli.setLabel(targetevaluationsubprocess, sourceevaluationprocess['$']['name']);
    var targetevaluationsubprocessshape = this.cli.element(targetevaluationsubprocess);

    var targetevaluationstartevent = this.cli.create('bpmn:StartEvent', {
      x: targetevaluationsubprocessshape.x,
      y: targetevaluationsubprocessshape.y
    }, targetevaluationsubprocessshape);

    var evaluateavailability = this.cli.append(targetevaluationstartevent, 'bpmn:Task');
    this.cli.setLabel(evaluateavailability, 'Evaluate situation');

    // create participants which have to be evaluated for their situation
    var createexecutionsubprocess = false;
    var setadaptendevent = false;
    var setadaptflowelement = false;
    var interruptingprocedure = false;
    this.executeChoreographyTaskTreeWalker(sourceevaluationprocess, participants, rootElements, participantref, evaluateavailability, targetevaluationsubprocess, createexecutionsubprocess, setadaptendevent, setadaptflowelement, interruptingprocedure);

    // maps the situationscope to the evaluationsubprocess
    this.evaluationsubprocesssituationmapping[currentsituationscope['$']['id']] = targetevaluationsubprocessshape;

    // returns the element before the endevent of the evaluationsubprocess (endevent gets deleted)
    var lastelement = this.getLastElementOfParticipantBeforeEndEvent(targetevaluationsubprocess);

    // evaluationcycle to evaluate whether all necessary situation elements are provided
    var evaluationgateway = this.cli.append(lastelement, 'bpmn:ExclusiveGateway');
    var endeval = this.cli.append(evaluationgateway, 'bpmn:EndEvent');
    var continuepath;

    // creates the subprocess of the execution part of the source situationscope
    var executionsubprocess = this.cli.append(targetevaluationsubprocess, 'bpmn:SubProcess', '300,300');
    this.bpmnReplace.replaceElement(this.cli.element(executionsubprocess), {
      type: 'bpmn:SubProcess',
      isExpanded: true
    });
    var executionsubprocessshape = this.cli.element(executionsubprocess);

    // console.log(this.cli.element(evaluationSubprocessShape));
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

    // save the mapping of endevent to the participant
    this.endeventmapping[participantref] = executionsubprocessend;

    // evaluation whether wait path or running compensate paths exist. This is needed since adaption paths can be either wait or running compensate type
    // and both of these require different case handling
    var waitpathexists = false;
    var runningcompensatepathexists = false;

    var appendingsituationalscopes = currentsituationscope['bpmn2:outgoing'];
    if (typeof appendingsituationalscopes !== 'undefined') {
      for (var sfs = 0; sfs < appendingsituationalscopes.length; sfs++) {
        for (var allsfs = 0; allsfs < sequenceFlows.length; allsfs++) {
          if (appendingsituationalscopes[sfs] === sequenceFlows[allsfs]['$']['id']) {
            if (sequenceFlows[allsfs]['$']['conditionType'] !== 'undefined') {
              if (sequenceFlows[allsfs]['$']['conditionType'] === 'WaitCondition') {
                waitpathexists = true;
              } else if (sequenceFlows[allsfs]['$']['conditionType'] === 'RunningCompensateCondition') {
                runningcompensatepathexists = true;
              }
            }
          }
        }
      }
    }

    // creates the wait path if an adaption path is wait type
    if (waitpathexists) {
      var iswaitpath = true;
      continuepath = this.createwaitcompensationpath(currentsituationscope, evaluationgateway, evaluateavailability, targetevaluationsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);

    }

    // creates the running compensate path if an adaption path is running compensate type
    if (runningcompensatepathexists) {
      var iswaitpath = false;
      continuepath = this.createrunningcompensationpath(currentsituationscope, executionsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    }

    // more case handling is needed for other condition cases than "Adapt" (for "Return", "Abort" and "Retry"). The case of "Continue" is an default case which skips the creation of wait and running compensate paths
    if (currentsituationscope['$']['sitscope:entryCondition'] === 'Return' || currentsituationscope['$']['sitscope:entryCondition'] === 'Abort' || currentsituationscope['$']['sitscope:entryCondition'] === 'Retry') {
      var iswaitpath = true;
      continuepath = this.createwaitcompensationpath(currentsituationscope, evaluationgateway, evaluateavailability, targetevaluationsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    } else if (currentsituationscope['$']['sitscope:runningCompensateCondition'] === 'Return' || currentsituationscope['$']['sitscope:runningCompensateCondition'] === 'Abort' || currentsituationscope['$']['sitscope:runningCompensateCondition'] === 'Retry') {
      var iswaitpath = false;
      continuepath = this.createrunningcompensationpath(currentsituationscope, executionsubprocessshape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    } else {
      var iswaitpath = false;
      this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, targetevaluationsubprocess, iswaitpath);
    }







  }

  createwaitcompensationpath(currentsituationscope, evaluationgateway, evaluateavailability, evaluationSubprocessShape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath) {

    // if waitfor entry is set true, a boundary event with a timer is needed
    if (currentsituationscope['$']['sitscope:waitforentry'] === 'true') {
      this.cli.connect(evaluationgateway, evaluateavailability, 'bpmn:SequenceFlow', '150,0');

      // creates a timer event boundary event which is attached to the subprocessshape. First it changes the businessobject, then the shape
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
        type: 'bpmn:BoundaryEvent',
        eventDefinitionType: 'bpmn:TimerEventDefinition',
      });
      this.cli.setLabel(boundary, currentsituationscope['$']['sitscope:entryConditionWait']);

      // sets the right gatewaytype depending on the adaption strategy. Then it looks for appended situationscopes and appends adaption paths to the gateway
      if (currentsituationscope['$']['sitscope:entryCondition'] === 'Adapt') {
        var adaptiondecision;
        if (currentsituationscope['$']['sitscope:adaptionStrategy'] === 'AllFit') {
          adaptiondecision = this.cli.append(boundary, 'bpmn:InclusiveGateway');
        }
        else {
          adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway');
        }
        continuepath = adaptiondecision;

        // find adaption situations (depth first search)
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Return') {
        var previousfittingsituation = this.getvalidpreviousSituation(currentsituationscope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: 'bpmn:StartEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(boundary, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: 'bpmn:EndEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Continue') {
        var firstel = evaluationSubprocessShape.outgoing[0].businessObject.targetRef.id;
        this.cli.connect(boundary, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Retry') {
        this.cli.connect(boundary, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Abort') {
        var endabort = this.cli.append(boundary, 'bpmn:EndEvent');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }

    // if waitforentry value is set false, a signal end event is set which connects to a boundary event which executes the adaption or exception path
    else if (currentsituationscope['$']['sitscope:waitforentry'] === 'false') {
      var signalendevent = this.cli.append(evaluationgateway, 'bpmn:EndEvent', '0,150');
      var signalendeventshape = this.cli.element(signalendevent);

      // adaption path
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
        type: 'bpmn:EndEvent',
        eventDefinitionType: 'bpmn:SignalEventDefinition'
      });
      this.bpmnReplace.replaceElement(boundaryShape, {
        type: 'bpmn:BoundaryEvent',
        eventDefinitionType: 'bpmn:SignalEventDefinition'
      });

      // if adapt condition is set all adaption paths connected to the situationscope are evaluated and connected to the exclusive gateway
      if (currentsituationscope['$']['sitscope:entryCondition'] === 'Adapt') {
        var adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway', '150,0');
        continuepath = adaptiondecision;

        // find adaption situations
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Return') {
        var previousfittingsituation = this.getvalidpreviousSituation(currentsituationscope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: 'bpmn:StartEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(boundary, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: 'bpmn:EndEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Continue') {
        var firstel = evaluationSubprocessShape.outgoing[0].businessObject.targetRef;
        this.cli.connect(boundary, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Retry') {
        this.cli.connect(boundary, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (currentsituationscope['$']['sitscope:entryCondition'] === 'Abort') {
        var endabort = this.cli.append(boundary, 'bpmn:EndEvent');
        this.findappendedsituationscopes(currentsituationscope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }

    // default path which ends the waitcondition path process
    else {
      var finalend = this.cli.append(evaluationSubprocess, 'bpmn:EndEvent');
      this.endeventmapping[participantref] = finalend;
    }
    return continuepath;
  }

  // if running compensate path exists and is defined, an event subprocess is created which functions similar to the wait condition path
  createrunningcompensationpath(startingSituationalScope, executionSubprocessShape, continuepath, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath) {

    // creation of the event subprocess
    var participantel = this.cli.element(participantref);
    var eventsubprocess = this.cli.create('bpmn:SubProcess', {
      x: executionSubprocessShape.x + executionSubprocessShape.width + 70,
      y: executionSubprocessShape.y + 70
    }, participantel);
    this.bpmnReplace.replaceElement(this.cli.element(eventsubprocess), {
      type: 'bpmn:SubProcess',
      isExpanded: true

    });
    this.bpmnReplace.replaceElement(this.cli.element(eventsubprocess), {
      type: 'bpmn:SubProcess',
      triggeredByEvent: true

    });
    var eventSubprocessShape = this.cli.element(eventsubprocess);

    // start event of the eventsubprocess, which is connected to the thrown error event from the execution subprocess boundary event
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
      type: 'bpmn:StartEvent',
      eventDefinitionType: 'bpmn:ErrorEventDefinition',
    });


    // creation of the execution subprocess boundary error event
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
      type: 'bpmn:BoundaryEvent',
      eventDefinitionType: 'bpmn:ErrorEventDefinition',
    });

    // if waitforcompensate value is set true a timer is needed which waits for a certain time before executing the exception or adaption path
    if (startingSituationalScope['$']['sitscope:waitforcompensate'] === 'true') {
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
        type: 'bpmn:IntermediateCatchEvent',
        eventDefinitionType: 'bpmn:TimerEventDefinition',
      });
      this.cli.setLabel(inter, startingSituationalScope['$']['sitscope:runningCompensateConditionWait']);

      // if adapt value is set a fitting gateway is set and adaption paths which are appended to the current situationscope are evaluated and connected to the gateway
      if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Adapt') {
        var adaptiondecision;
        if (startingSituationalScope['$']['sitscope:adaptionStrategy'] === 'AllFit') {
          adaptiondecision = this.cli.append(inter, 'bpmn:InclusiveGateway');
        }
        else {
          adaptiondecision = this.cli.append(inter, 'bpmn:ExclusiveGateway');
        }
        continuepath = adaptiondecision;

        // find adaption situations
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Return') {
        var previousfittingsituation = this.getvalidpreviousSituation(startingSituationalScope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: 'bpmn:StartEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(inter, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: 'bpmn:EndEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Continue') {
        var firstel = executionSubprocessShape.outgoing[0].businessObject.targetRef.id;
        this.cli.connect(inter, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Retry') {
        this.cli.connect(inter, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Abort') {
        var endabort = this.cli.append(inter, 'bpmn:EndEvent');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }

    // if waitforentry value is set false, a signal end event is set which connects to a boundary event which executes the adaption or exception path
    else if (startingSituationalScope['$']['sitscope:waitforcompensate'] === 'false') {

      // if adapt value is set a fitting gateway is set and adaption paths which are appended to the current situationscope are evaluated and connected to the gateway
      if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Adapt') {
        var adaptiondecision = this.cli.append(inter, 'bpmn:ExclusiveGateway', '150,0');
        continuepath = adaptiondecision;

        // find adaption situations
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if return condition is set, the algorithm looks for the direct previous situationscope which performs standard execution and connects a message path to that situationscope
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Return') {
        var previousfittingsituation = this.getvalidpreviousSituation(startingSituationalScope, sequenceFlows, subProcesses);
        var situationevaluation = this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
        var messageStartEvent = this.cli.create('bpmn:StartEvent', {
          x: situationevaluation.x - 50,
          y: situationevaluation.y - 50
        }, situationevaluation.parent);
        var messageStartEventShape = this.cli.element(messageStartEvent);
        this.bpmnReplace.replaceElement(messageStartEventShape, {
          type: 'bpmn:StartEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageStartEvent, situationevaluation, 'bpmn:SequenceFlow');
        var messageend = this.cli.append(inter, 'bpmn:EndEvent');
        var messageendShape = this.cli.element(messageend);
        this.bpmnReplace.replaceElement(messageendShape, {
          type: 'bpmn:EndEvent',
          eventDefinitionType: 'bpmn:MessageEventDefinition'
        });
        this.cli.connect(messageend, messageStartEvent, 'bpmn:MessageFlow');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if continue condition is set, the exception path connects a sequenceflow directly to the standard execution and skips any adaption or exception path
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Continue') {
        var firstel = executionSubprocessShape.outgoing[0].businessObject.targetRef;
        this.cli.connect(inter, firstel, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision, iswaitpath);
      }

      // if retry condition is set, the exception path connects a sequenceflow to the evaluationsubprocess to execute the evaluation path again
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Retry') {
        this.cli.connect(inter, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }

      // if abort condition is set, the exceptionpath connects directly to an endevent stopping all execution
      else if (startingSituationalScope['$']['sitscope:runningCompensateCondition'] === 'Abort') {
        var endabort = this.cli.append(inter, 'bpmn:EndEvent');
        this.findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, evaluationSubprocess, iswaitpath);
      }
    }

    // default path which ends the running compensate condition path process
    else {
      var finalend = this.cli.append(evaluationSubprocess, 'bpmn:EndEvent');
      this.endeventmapping[participantref] = finalend;
    }
    return continuepath;
  }

  addBaseProcessStructure(startingelement, participantname, subprocessname) {
    var executionSubprocess = this.cli.append(startingelement, 'bpmn:SubProcess', '300,300');
    this.bpmnReplace.replaceElement(this.cli.element(executionSubprocess), {
      type: 'bpmn:SubProcess',
      isExpanded: true
    });
    this.cli.setLabel(executionSubprocess, subprocessname);

    var executionSubprocessShape = this.cli.element(executionSubprocess);
    var executionsubprocessStartEvent = this.cli.create('bpmn:StartEvent', {
      x: executionSubprocessShape.x,
      y: executionSubprocessShape.y
    }, executionSubprocessShape);
    var executionsubprocessendevent = this.cli.append(executionSubprocess, 'bpmn:EndEvent');
    this.endeventmapping[participantname] = executionsubprocessendevent;
    startingelement = executionsubprocessStartEvent;
  }

  // depth first search algorithm for traversing a choreography process. First, the algorithm runs once to count the number of participants and saves all participant ids and
  // a list for each participants, which elements from the choreography process need to be set at the participant. Next the algorithm takes the participant names and the
  // participant element map to create the participant and the corresponding process for each participant. For this it traverses the choreography once more and if an element
  // is in the mapping list, creates a corresponding element (choreography task to message send or receive task, gateways to gateways, events to events) and appends it to the
  // last element. Simultaneously it maps choreography tasks to the message send and receive tasks and saves them in a map. Finally, the algorithm traverses the choreography
  // process once more and creates the corresponding message flows.
  // There is a difference between evaluation process, execution process and adaption path, which is implemented via switches.
  executeChoreographyTaskTreeWalker(currentsituationalscope, participants, rootElements, initiatingparticipant, startingpoint, evaluationSubprocess, createsubprocess, setadaptendevent, setadaptflowelement, executeInterruptingProcedure) {

    // names of participants and their mapping to necessary elements
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

      // evaluation which element is the starting element to which the whole process needs to be appended to. If the participant is the initiating participant
      // of the choreography process, the starting point is the element which is given as a value to the procedure. If the participant has been created yet
      // a new participant is created and its start element is the starting point. Else it looks in the global participant end event mapping list and returns that
      // element.
      if (initiatingparticipant === participantkeys[i]) {
        startingelement = startingpoint;
      } else {

        startingelement = this.getLastElementOfParticipantBeforeEndEvent(participantkeys[i]);

        // creates a subprocess if a subprocess is needed and has not been created yet
        if (createsubprocess === true) {
          var executionSubprocess = this.cli.append(startingelement, 'bpmn:SubProcess', '300,300');
          this.bpmnReplace.replaceElement(this.cli.element(executionSubprocess), {
            type: 'bpmn:SubProcess',
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

      // if the interrupting value is set for the execution, a special construct is needed. It creates a parallel gateway which creates another
      // token which goes to a event based gateway to which message receive events are appended. These message receive tasks have a corresponing
      // message send task in other participants, which are fired when the execution of their process is finished and ends all other processes in
      // the group of processes
      if (executeInterruptingProcedure === true) {

        // since a different structure already has been created in the initiating participant, the structure needs to be adapted
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

          // for all other participants it simply can be appended
        } else {
          var parallel = this.cli.append(startingelement, 'bpmn:ParallelGateway');
          var event = this.cli.append(parallel, 'bpmn:EventBasedGateway', '150,150');
          startingelement = parallel;
          eventgatewaylist.push(event);
        }

      }


      var startevent = currentsituationalscope['bpmn2:startEvent'][0];
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

        // all child nodes of the current node needs to be evaluated
        for (let n of node['bpmn2:outgoing']) {

          // the algorithm needs to differentiate between choreography task and different types of element
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

              // only elements which are needed for the participant need to be treated
              for (var it = 0; it < elementsofparticipant.length; it++) {
                if (elementsofparticipant[it] === currentevaluatedelement) {
                  var finalelementid = currentevaluatedelement['$']['id'];

                  // since in some cases the algorithm for finding needed elements sometimes include elements which are not needed (due to some modelling limitations)
                  // a counter for counting the number of times a choreography task has been visited is needed. If the maximal amount of references to the choreography
                  // tasks are observed, no more elements from the source model need to be appended.
                  if (maxref > currentref) {

                    // differentiate between choreography tasks and other elements. Also some layouting is needed to improve readability of the target model
                    if (nextelement[0]) {
                      var lastvalidelement = this.getvalidpreviouselement(node, positioningmapping, currentsituationalscope);
                      var sendtaskposition_y = positioningmapping[lastvalidelement['$']['id']] * 100;
                      var sendtaskposition = '150,' + sendtaskposition_y;

                      // initiating participants need a send message task
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

                        // other participants need a receive message task
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

                    // checks if the next element in the list of relevant elements is an end event. If yes, an end event needs to be set (maybe the traverse
                    // algorithm needs some rework to include end events into the search, but issues may arise with appending new elements to already created elements)
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

                    // if the maximal number of elements references already were observed, the next element can be discarded. Again, this issue may arise
                    // with special cases in the source model (More precisely if the last relevant element in the evaluation of relevant elements is not directly
                    // appended to an end event)
                  } else if (maxref === currentref) {
                    for (var rem = 0; rem < elementsofparticipant.length; rem++) {
                      if (elementsofparticipant[rem]['$']['id'] === currentevaluatedelement['$']['id']) {
                        elementsofparticipant.splice(rem, 1);
                      }
                    }
                  }
                }
              }

              // some basic positionmapping for better layouting. Layouting still sucks though :(
              var isachoreography = this.isChoreography(currentsituationalscope, node['$']['id']);
              for (var otherelement = 0; otherelement < elementsofparticipant.length; otherelement++) {
                if (elementsofparticipant[otherelement] === node) {
                  if (!isachoreography) {
                    positioningmapping[node['$']['id']] = positioningmapping[node['$']['id']] + 1;
                  }
                }
              }

              // another special case which needs to be taken in account for. If the next element already has been visited
              // and is relevant for the process, it needs to be connected via sequenceflow. This little script takes care of it
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

      // in some very rare cases (if the endevent mapping has not been set correctly) no proper endevent exists. This snippet takes care of it
      var evaluationsubprocessshape;
      if ((typeof evaluationSubprocess !== 'undefined') && (initiatingparticipant === participantkeys[i])) {
        evaluationsubprocessshape = this.cli.element(evaluationSubprocess);

      } else {
        evaluationsubprocessshape = this.cli.element(startingelement).parent;

      }
      var hasendevent = false;
      for (var endEventIterator = 0; endEventIterator < evaluationsubprocessshape.children.length; endEventIterator++) {
        if (evaluationsubprocessshape.children[endEventIterator].type == 'bpmn:EndEvent') {
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

    // sets all message flows between the message tasks
    this.addmessages(currentsituationalscope, globalchortaskmapping);

    // if the interrupting value is set true, the interrupting mechanism needs to be created (message send tasks to the interrupting message receive tasks
    // of the other processes). Supports multiple ending choreography tasks ending a choreography process
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

  // backwards breadth first search (needed if more than one choreography task in a process ends the choreography process)
  // which finds all last choreography tasks on the same level and returns them
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


  // returns an element before the current element node for layouting issues (to avoid overlapping positioning in some cases). A valid element is an element
  // which already has been positioned
  getvalidpreviouselement(node, positioningmapping, situationscope) {
    var lastvalidelement = node;
    if (typeof lastvalidelement['bpmn2:incoming'] !== 'undefined') {
      if (typeof positioningmapping[lastvalidelement['$']['id']] === 'undefined') {
        var iterate = this.checkpreviouselement(situationscope, lastvalidelement['bpmn2:incoming']);

        // console.log(iterate);
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

  // returns the situationscope which has initiated the current situationscope if the Return condition has been set
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

  // returns a situationscope from the sequenceflowid
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

  // returns the element which is the source of the sequenceflow appended to the end event. It deletes the end event, since it is never needed
  // when using this function
  getLastElementOfParticipantBeforeEndEvent(participantname) {
    var collabo = this.cli.element(participantname);
    var partendevent;
    if (typeof this.elementRegistry.get(this.endeventmapping[participantname]) !== 'undefined') {
      var partendevent = this.cli.element(this.endeventmapping[participantname]);

    } else {
      for (var endEventIterator = 0; endEventIterator < collabo.children.length; endEventIterator++) {
        if (collabo.children[endEventIterator].type == 'bpmn:EndEvent') {
          partendevent = this.cli.element(collabo.children[endEventIterator].id);
        }
      }
    }

    if (partendevent === undefined) {
      return collabo;
    } else {

      if (!partendevent.hasOwnProperty('incoming')) {
        return collabo;
      }

      if (partendevent.incoming.length == 0) {
        return collabo;
      }

      var lastmessagetask = this.cli.element(partendevent.incoming[0].businessObject.sourceRef.id);
      this.cli.removeShape(partendevent);
      return lastmessagetask;
    }
  }

  // depth first search algorithm which saves the participants and their relevant elements needed in the target model
  getNumberOfParticipantsOfChorProcess(situationscope) {

    console.log('Working on following situationscope:');
    console.log(situationscope);

    var visitedparticipants = {};
    var visitedparticipantsarraylist = {};
    var startevent = situationscope['bpmn2:startEvent'][0];
    var stack = [];
    var visited = [];
    var output = [];
    var endelement;
    var globalchortaskmapping = {};
    var listofgateways = [];
    stack.push(startevent);
    stackloop: while (stack.length) {
      console.log('Currently in Stack:');
      console.log(stack);
      console.log('Already visited nodes:');
      console.log(visited);
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        console.log('Adding following node to visited:');
        console.log(node);
        visited.push(node);
        output.push(node);
      }

      console.log(node);

      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(situationscope, n);
        if (!this.checkforendevent(situationscope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(situationscope, nextelement[1]);
            console.log('Found the following choreography task:');
            console.log(finalelement);
          }
          else {
            var element = this.getTargetFromSequenceflow(situationscope, n);
            finalelement = this.getgatewayorevent(situationscope, element);
            console.log('Found following gateway:');
            console.log(finalelement);
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

                // globalchortaskmapping[finalelementid].push(adaptionsendmessagetask);

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
            console.log('Adding following (final)element to stack:');
            console.log(finalelement);
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

  // depth first search which takes the mapping from choreography tasks to message send and receive tasks and connects them via message flows
  addmessages(startingSituationalScope, globalmapping) {
    var startevent = startingSituationalScope['bpmn2:startEvent'][0];
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

  // depth first search for the first choreography task in a situationscope
  getValidFirstChoreographyTask(startingSituationalScope) {
    var startevent = startingSituationalScope['bpmn2:startEvent'][0];
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
    var sequenceflows = situationalScope['bpmn2:sequenceFlow'];
    for (var seq = 0; seq < sequenceflows.length; seq++) {
      if (sequenceflows[seq].$.id == sequenceflowid) {

        // console.log(situationsequenceFlows[i].$.targetRef);
        return sequenceflows[seq].$.targetRef;
      }
    }
  }

  // returns the source id from a sequenceflow
  getSourceFromSequenceflow(situationalScope, sequenceflowid) {
    var sequenceflows = situationalScope['bpmn2:sequenceFlow'];
    for (var seq = 0; seq < sequenceflows.length; seq++) {
      if (sequenceflows[seq].$.id == sequenceflowid) {

        // console.log(situationsequenceFlows[i].$.targetRef);
        return sequenceflows[seq].$.sourceRef;
      }
    }
  }

  // iterates over all appended sequenceflows and, depending on what type of sequenceflow it is (Adapt and Running or Wait condition or Continue) directs the programm
  // execution to the right function
  findappendedsituationscopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, iswaitpath) {

    // special cases are needed for wait condition or running compensate condition
    var waitorrunningpath = '';
    if (iswaitpath) {
      waitorrunningpath = 'WaitCondition';
    } else {
      waitorrunningpath = 'RunningCompensateCondition';
    }
    var endabortmessagelist = [];
    var eventgatewaymessagelist = [];
    var sitscopeoutgoingflows = startingSituationalScope['bpmn2:outgoing'];
    var executeInterruptingProcedure = false;

    if (typeof sitscopeoutgoingflows !== 'undefined') {
      if (startingSituationalScope['$']['sitscope:executionType'] === 'Interrupting') {
        var interruptingexecutioncounter = 0;
        for (var i = 0; i < sitscopeoutgoingflows.length; i++) {
          for (var j = 0; j < sequenceFlows.length; j++) {
            if (sitscopeoutgoingflows[i] == sequenceFlows[j].$.id) {
              if ((sequenceFlows[j].$.flowtype === 'Adapt') || typeof sequenceFlows[j].$.flowtype === 'undefined') {
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

            // Adapt flow type branch. The undefined element is caused by legacy models and may be deleted later
            if ((sequenceFlows[j].$.flowtype === 'Adapt') || typeof sequenceFlows[j].$.flowtype === 'undefined') {
              if (sequenceFlows[j].$.conditionType === waitorrunningpath) {
                var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);

                var setglobalendevent = false;
                var setadaptendevent = true;

                // special case for interrupting value
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
                var conditionstring = '';

                // default case adaption path branch
                if (sit['$']['sitscope:isDefault'] === 'true') {
                  conditionstring = 'Default';

                  // sets name of situation adaption path
                } else {
                  var sitscopesituations = sit['sitscope:situation'];
                  var conditionstring = '${';
                  for (let currentsituation of sitscopesituations) {
                    conditionstring += currentsituation['$']['situationname'] + '==' + currentsituation['$']['situationtrigger'] + '&&';
                  }
                  if (conditionstring.substring(conditionstring.length - 2, conditionstring.length) === '&&') {
                    conditionstring = conditionstring.substring(0, conditionstring.length - 2);
                  }
                  conditionstring += '}';
                }
                var newcondition = this.moddle.create('bpmn:FormalExpression', {
                  body: conditionstring
                });
                this.modeling.updateProperties(fittingsequenceflow, {
                  conditionExpression: newcondition
                });
                this.cli.setLabel(fittingsequenceflow, conditionstring);
                if (typeof sit['bpmn2:outgoing'] !== 'undefined') {
                  this.findappendedsituationscopes(sit, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, iswaitpath);
                }
              }
            }

            // continue flow branch
            else if (sequenceFlows[j].$.flowtype === 'Continue') {
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

      // special case if interrupting value is set. Creates the interrupting message flows.
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
                this.cli.setLabel(thisthing, 'Abort');
              }
            }
          }

          // if more than one choreography task ends the choreography process, they all need to be causal in the interruption
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
                    this.cli.setLabel(thisthing, 'Abort');

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

  // check if element is a choreography task
  checkforchortask(sit, sequenceflow) {
    var situationsequenceFlows = sit['bpmn2:sequenceFlow'];
    var targetelement;
    var chortask;
    for (var seq = 0; seq < situationsequenceFlows.length; seq++) {
      if (situationsequenceFlows[seq].$.id == sequenceflow) {
        targetelement = situationsequenceFlows[seq].$.targetRef;
      }
    }
    var currentgateway = this.getgatewayorevent(sit, targetelement);
    var outgoinggatewayflows = currentgateway['bpmn2:outgoing'];
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

    // console.log(fittingsituationsequenceflow);
    var elementcheck = this.checknextelement(situationscope, fittingsituationsequenceflow);

    var currentchortask = chortask;

    // console.log(elementcheck[0]);
    // console.log(elementcheck[1]);
    currentfittingsituationsequenceflow = elementcheck[1];
    var situationsequenceflows = situationscope['bpmn2:sequenceFlow'];
    var situationendevents = situationscope['bpmn2:endEvent'];
    var choreographytasks = situationscope['bpmn2:choreographyTask'];

    if (elementcheck[0] !== true) {
      var foundchoreography;
      var foundgateway = this.appendgatewayorevent(situationscope, elementcheck[1], appendedelement);
      if (typeof foundgateway[0] !== 'undefined') {
        appendedelement = foundgateway[1];

        var gatewaysequenceflows = foundgateway[0]['bpmn2:outgoing'];
        for (var outgoingvalues = 0; outgoingvalues < gatewaysequenceflows.length; outgoingvalues++) {
          var fittingsituationsequenceflow;
          for (var i = 0; i < situationsequenceflows.length; i++) {

            // look the sequenceflow which belongs to the start event inside the situationalscope
            if (situationsequenceflows[i].$.id == gatewaysequenceflows[outgoingvalues]) {

              // console.log(situationsequenceflows[i].$.id);
              fittingsituationsequenceflow = situationsequenceflows[i].$.id;
            }
          }
          for (var i = 0; i < choreographytasks.length; i++) {

            // look for the choreography task belonging to the sequenceflow
            if (choreographytasks[i].$.id == fittingsituationsequenceflow) {

              // console.log("find it");
              foundchoreography = choreographytasks[i];
            }

          }

          // console.log(foundgateway);
          // console.log(gatewaysequenceflows[outgoingvalues]);


          this.createAllParticipantsOfSitScope(participants, fittingParticipantName, participantshape, rootElements, appendedelement, situationscope, foundchoreography, fittingsituationsequenceflow);

          // this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,appendedelement,situationscope);
        }
      } else {

        // console.log("adapt");
        var endadaptionevent = this.cli.append(appendedelement, 'bpmn:EndEvent');
      }



    } else {
      if (typeof currentchortask === 'undefined') {
        currentchortask = this.findChoreographyTask(situationscope, currentfittingsituationsequenceflow);

      }

      var taskparticipants = currentchortask['bpmn2:participantRef'];
      var taskoutgoingsequenceflows = currentchortask['bpmn2:outgoing'];

      // console.log(currentchortask);


      // console.log(chortask);
      // console.log(situationscope);
      var taskpositioncounter = 0;

      if (typeof choreographytasks !== 'undefined') {
        for (var chorincrement = 0; chorincrement < choreographytasks.length; chorincrement++) {
          if (currentchortask.$.id == choreographytasks[chorincrement].$.id) {
            for (var k = 0; k < taskparticipants.length; k++) {
              var taskparticipantname = this.getParticipantName(participants, taskparticipants[k]);

              // console.log(situationscope);
              // console.log(chortask);

              // console.log(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined');
              if (taskparticipantname != fittingParticipantName) {
                if (typeof this.elementRegistry.get(taskparticipants[k]) === 'undefined') {
                  var newinteractingparticipant = this.createNewParticipant(this.lastparticipantshape, rootElements, taskparticipants[k]);
                  var newinteractingParticipantShape = this.cli.element(newinteractingparticipant);

                  // console.log(taskparticipants[k]);
                  // console.log(newinteractingParticipantShape.parent);
                  this.cli.setLabel(newinteractingParticipantShape.parent, taskparticipantname);
                  this.lastparticipantshape = newinteractingParticipantShape.parent;
                  var sendtaskposition_y = this.taskpositioncounter * 100;
                  var sendtaskposition = '150,' + sendtaskposition_y;

                  // console.log(sendtaskposition);
                  var adaptionmessagetask = this.cli.append(appendedelement, 'bpmn:SendTask', sendtaskposition);
                  this.taskpositioncounter++;
                  var adaptionreceivemessagetask = this.cli.append(newinteractingparticipant, 'bpmn:ReceiveTask', '150,0');
                  var interactionmessage = this.cli.connect(adaptionmessagetask, adaptionreceivemessagetask, 'bpmn:MessageFlow', '150,0');
                  this.cli.setLabel(interactionmessage, currentchortask.$.name);

                  // console.log("partscopes");
                  var endadaptionreceiveevent = this.cli.append(adaptionreceivemessagetask, 'bpmn:EndEvent');
                  for (var m = 0; m < taskoutgoingsequenceflows.length; m++) {
                    for (var l = 0; l < situationsequenceflows.length; l++) {
                      if (taskoutgoingsequenceflows[m] == situationsequenceflows[l].$.id) {

                        // console.log(situationsequenceflows[l].$.targetRef);

                        var foundendevent = false;
                        for (var n = 0; n < situationendevents.length; n++) {
                          if (situationsequenceflows[l].$.targetRef == situationendevents[n].$.id) {
                            foundendevent = true;
                          }
                        }
                        if (foundendevent) {

                          // console.log("Endevent");
                          var endadaptionevent = this.cli.append(adaptionmessagetask, 'bpmn:EndEvent');

                        } else {
                          var followingchoreography = this.findChoreographyTask(situationscope, situationsequenceflows[l].$.targetRef);

                          // console.log("noendevent");
                          // enable gateways and events
                          // console.log(followingchoreography);
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

  // checks if element is an endevent
  checkforendevent(sit, elementname) {
    var situationendevents = sit['bpmn2:endEvent'];
    for (var n = 0; n < situationendevents.length; n++) {
      if (elementname == situationendevents[n].$.id) {
        return true;
      }
    }

  }

  // returns the endevent by endeventid
  getEndevent(sit, elementname) {
    var situationendevents = sit['bpmn2:endEvent'];
    for (var n = 0; n < situationendevents.length; n++) {
      if (elementname == situationendevents[n].$.id) {
        return situationendevents[n];
      }
    }
  }

  // returns the participantname by participantid
  getParticipantName(participants, participantref) {
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].$.id == participantref) {
        return participants[i].$.name;
      }
    }

  }

  // checks if the next element is a choreographytask. If yes it returns a tuple of the choreography task and the boolean true. Else it returns undefined and false
  checknextelement(situationalScope, outgoingelement) {

    var situationchoreographytask = situationalScope['bpmn2:choreographyTask'];
    var situationsequenceFlows = situationalScope['bpmn2:sequenceFlow'];
    var outgoingsituationstart;
    var targetid;
    var foundsituationchoreographytask;

    // in this case we just get the first element in the scope
    if (typeof outgoingelement === 'undefined') {
      var situationstart = situationalScope['bpmn2:startEvent'][0];
      outgoingsituationstart = situationstart['bpmn2:outgoing'][0];
    }

    for (var i = 0; i < situationsequenceFlows.length; i++) {

      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart | situationsequenceFlows[i].$.id == outgoingelement) {
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

  // checks if previous element is a choreographytask and returns it
  checkpreviouselement(situationalScope, outgoingelement) {
    var situationchoreographytask = situationalScope['bpmn2:choreographyTask'];
    var situationsequenceFlows = situationalScope['bpmn2:sequenceFlow'];
    var outgoingsituationstart = outgoingelement;
    var targetid;
    var foundsituationchoreographytask;

    // console.log("why not");
    // console.log(situationalScope);
    // console.log(outgoingsituationstart);

    for (var i = 0; i < situationsequenceFlows.length; i++) {

      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {

        // console.log(situationsequenceFlows[i].$.targetRef);
        targetid = situationsequenceFlows[i].$.sourceRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {

      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == targetid) {

        // console.log("find it");
        return [true, targetid];
      }

    }
    if (typeof foundsituationchoreographytask === 'undefined') {
      return [false, targetid];


    }
  }

  // returns the first choreographytask in a situationscope/evaluationprocess
  findStartingChoreographyTask(startingSituationalScope) {
    var situationstart = startingSituationalScope['bpmn2:startEvent'][0];
    var situationchoreographytask = startingSituationalScope['bpmn2:choreographyTask'];
    var situationsequenceFlows = startingSituationalScope['bpmn2:sequenceFlow'];
    var outgoingsituationstart = situationstart['bpmn2:outgoing'][0];
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

  // appends a gateway to the given element depending on the elementid (creates the corresponding gateway or event)
  appendgatewayorevent(startingSituationalScope, elementid, appendedelement, position) {
    var situationstart = startingSituationalScope['bpmn2:startEvent'][0];
    var situationsequenceFlows = startingSituationalScope['bpmn2:sequenceFlow'];
    var situationchoreographytask = startingSituationalScope['bpmn2:choreographyTask'];
    var sendtaskposition_y;
    var sendtaskposition;
    if (typeof position !== 'undefined') {
      sendtaskposition_y = this.taskpositioncounter * 100;
      sendtaskposition = '150,' + sendtaskposition_y;
    }
    else { sendtaskposition = position; }
    var situationeventBasedGateway = startingSituationalScope['bpmn2:eventBasedGateway'];
    var situationcomplexGateway = startingSituationalScope['bpmn2:complexGateway'];
    var situationexclusiveGateway = startingSituationalScope['bpmn2:exclusiveGateway'];
    var situationinclusiveGateway = startingSituationalScope['bpmn2:inclusiveGateway'];
    var situationparallelGateway = startingSituationalScope['bpmn2:parallelGateway'];
    var choreographytasks = startingSituationalScope['bpmn2:choreographyTask'];
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
              type: 'bpmn:IntermediateCatchEvent',
              eventDefinitionType: 'bpmn:TimerEventDefinition',
            });
          }
          if (typeof intermediateCatchevents[n]['bpmn2:conditionalEventDefinition'] !== 'undefined') {
            foundgateway = intermediateCatchevents[n];
            newappendix = this.cli.append(appendedelement, 'bpmn:IntermediateCatchEvent', sendtaskposition);
            var newappendixshape = this.cli.element(newappendix);

            this.bpmnReplace.replaceElement(newappendixshape, {
              type: 'bpmn:IntermediateCatchEvent',
              eventDefinitionType: 'bpmn:ConditionalEventDefinition',
            });
          }
          if (typeof intermediateCatchevents[n]['bpmn2:signalEventDefinition'] !== 'undefined') {
            foundgateway = intermediateCatchevents[n];
            newappendix = this.cli.append(appendedelement, 'bpmn:IntermediateCatchEvent', sendtaskposition);
            var newappendixshape = this.cli.element(newappendix);

            this.bpmnReplace.replaceElement(newappendixshape, {
              type: 'bpmn:IntermediateCatchEvent',
              eventDefinitionType: 'bpmn:SignalEventDefinition',
            });
          }
        }
      }

    }
    return [foundgateway, newappendix];

  }

  // returns the gateway or event object depending on the elementid
  getgatewayorevent(startingSituationalScope, elementid) {
    var situationstart = startingSituationalScope['bpmn2:startEvent'][0];
    var situationsequenceFlows = startingSituationalScope['bpmn2:sequenceFlow'];
    var situationchoreographytask = startingSituationalScope['bpmn2:choreographyTask'];

    var situationeventBasedGateway = startingSituationalScope['bpmn2:eventBasedGateway'];
    var situationcomplexGateway = startingSituationalScope['bpmn2:complexGateway'];
    var situationexclusiveGateway = startingSituationalScope['bpmn2:exclusiveGateway'];
    var situationinclusiveGateway = startingSituationalScope['bpmn2:inclusiveGateway'];
    var situationparallelGateway = startingSituationalScope['bpmn2:parallelGateway'];
    var intermediateCatchevents = startingSituationalScope['bpmn2:intermediateCatchEvent'];
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

  // return choreography task from id
  findChoreographyTask(situationalscope, choreographyid) {
    var situationchoreographytask = situationalscope['bpmn2:choreographyTask'];

    for (var i = 0; i < situationchoreographytask.length; i++) {

      // look for the entry with a matching `code` value
      if (situationchoreographytask[i].$.id == choreographyid) {
        return situationchoreographytask[i];

        // obj[i].name is the matched result
      }
    }
  }

  // checks if element is choreography
  isChoreography(situationalscope, choreographyid) {
    var situationchoreographytask = situationalscope['bpmn2:choreographyTask'];
    var returnvalue = false;
    for (var i = 0; i < situationchoreographytask.length; i++) {
      if (situationchoreographytask[i].$.id == choreographyid) {
        returnvalue = true;
      }
    }
    return returnvalue;
  }

  // returns all subprocesses that are connected to the given startEvent
  findSituationScopes(startEvent, sequenceFlows, subProcesses) {

    var outgoingstart = startEvent['bpmn2:outgoing'];
    var foundSubprocesses = [];

    for (var i = 0; i < outgoingstart.length; i++) {
      for (var j = 0; j < subProcesses.length; j++) {
        if (subProcesses[j]['bpmn2:incoming'].includes(outgoingstart[i])) {
          foundSubprocesses.push(subProcesses[j]);
        }
      }
    }

    return foundSubprocesses;
  }

  // finds the starting situationscope
  findStartingSituationalScope(startEvent, sequenceFlows, subProcesses) {
    var outgoingstart = startEvent['bpmn2:outgoing'][0];
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

  // find situationscope by name
  findSituationalScope(sitscopes, sitscopename) {
    for (var i = 0; i < sitscopes.length; i++) {
      if (sitscopes[i].$.id == sitscopename) {
        return sitscopes[i];
      }
    }


  }



}


ModelTransformer.$inject = ['bpmnjs', 'modeling', 'config',
  'eventBus', 'bpmnRenderer', 'textRenderer', 'cli', 'bpmnFactory', 'bpmnReplace', 'elementRegistry', 'moddle'];
