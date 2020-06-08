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
      this.cli.connect(situationDataHandling.endGateway, relevantTask, 'bpmn:SequenceFlow', '150,0');
    }

    for (let predTaskIndex = 0; predTaskIndex < predTasks.length; predTaskIndex++) {
      let predTask = predTasks[predTaskIndex];
      this.cli.connect(predTask, situationDataHandling.startGateway, 'bpmn:SequenceFlow', '150,0');
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

    toRemove.forEach(x => {this.cli.removeConnection(x);});

  }

  _getSequenceFlows() {
    let result = [];
    let elementIds = this.cli.elements();
    for (let index = 0; index < elementIds.length; index++) {
      if (elementIds[index].includes('Flow')) {
        let element = this.cli.element(elementIds[index]);
        if (element.type.includes('SequenceFlow')) {
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
      this.cli.connect(situationDataHandling.endGateway, relevantTask, 'bpmn:SequenceFlow', '150,0');
    }

    for (let predTaskIndex = 0; predTaskIndex < predTasks.length; predTaskIndex++) {
      let predTask = predTasks[predTaskIndex];
      this.cli.connect(predTask, situationDataHandling.startGateway, 'bpmn:SequenceFlow', '150,0');
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
      if (x.type.includes('SequenceFlow')) {
        result.push(x.source);
      }
    });
    return result;
  }

  _findPredecessorTasks(task,choreographyModel) {
    let result = [];
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
    g.setGraph(options);

    tasks.forEach(x => {g.setNode(x.id, { label: x.id, width: x.width, height: x.height });});

    for (let flowIndex = 0; flowIndex < flows.length; flowIndex++) {
      let flow = flows[flowIndex];
      let sourceId = flow.source;
      let targetId = flow.target;
      g.setEdge(sourceId, targetId, { label: flow.id });
    }

    dagre.layout(g);

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

}


ModelTransformer.$inject = ['bpmnjs', 'modeling', 'config',
  'eventBus', 'bpmnRenderer', 'textRenderer', 'cli', 'bpmnFactory', 'bpmnReplace', 'elementRegistry', 'moddle'];
