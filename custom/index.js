import ModelTransformer from './ModelTransformer';
import EditorActions from './EditorActions';
import CustomButton from './CustomButton';
//import Cli from 'bpmn-js-cli/lib/Cli';
//import CliInitializer from 'bpmn-js-cli/lib/Initializer';

export default {
    __init__: ['modelTransformer','seditorActions' ,
    'customButton'
    //'cliInitializer'
],
    modelTransformer: ['type', ModelTransformer],
    seditorActions:['type',EditorActions],
    customButton:['type',CustomButton]
    //cli: [ 'type', Cli ],
    //cliInitializer: [ 'type', CliInitializer ]
};