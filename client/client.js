import { registerBpmnJSPlugin } from 'camunda-modeler-plugin-helpers';

import customModule from '../custom';

var  CliModule = require('bpmn-js-cli').default;
registerBpmnJSPlugin(CliModule);
registerBpmnJSPlugin(customModule);