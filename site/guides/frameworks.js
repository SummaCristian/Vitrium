import { h, section, codeBlock, table } from '../dom.js';

export default {
  id: 'frameworks',
  title: 'Using a framework',
  abstract: 'Mount the components from React, Vue or Svelte, and keep them in sync with your state.',
  sections() {
    return [
      section('The idea', {},
        h('p', {}, 'The components do not depend on a framework. Each is a function that builds a real DOM element and hands it back, so a framework only has to do three things: create it when its own element mounts, update it when its data changes, and destroy it when it unmounts.'),
        table(['Step', 'Call', 'When'], [
          ['Create', '`createToggle({ … })`, then `container.append(x.el)`', 'The component mounts.'],
          ['Update', '`x.set(value)`, `x.setDisabled(…)`', 'A prop changes.'],
          ['Destroy', '`x.destroy()`', 'The component unmounts.'],
        ])),

      section('React', {},
        h('p', {}, 'Create the component in an effect, put its element in a ref, and return the cleanup. The value goes in through `set()` in a second effect, which is silent, so it does not call your handler back.'),
        codeBlock(`
import { useEffect, useRef } from 'react';
import { createToggle } from 'vitrium';

export function Toggle({ value, onChange, label }) {
  const host = useRef(null);
  const toggle = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    toggle.current = createToggle({ value, label, onChange: (on) => latest.current(on) });
    host.current.append(toggle.current.el);
    return () => toggle.current.destroy();
  }, [label]);

  useEffect(() => { toggle.current.set(value); }, [value]);

  return <span ref={host} />;
}`),
        h('p', {}, 'The handler goes through a ref so the toggle is not rebuilt each time the parent passes a new function. Strict mode runs the effect twice in development, which is safe: the first toggle is destroyed before the second is made.')),

      section('Vue', {},
        h('p', {}, 'The same steps, in the lifecycle hooks:'),
        codeBlock(`
<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createToggle } from 'vitrium';

const props = defineProps({ modelValue: Boolean, label: String });
const emit = defineEmits(['update:modelValue']);
const host = ref(null);
let toggle;

onMounted(() => {
  toggle = createToggle({
    value: props.modelValue, label: props.label,
    onChange: (on) => emit('update:modelValue', on),
  });
  host.value.append(toggle.el);
});
onBeforeUnmount(() => toggle.destroy());
watch(() => props.modelValue, (v) => toggle.set(v));
</script>

<template><span ref="host" /></template>`)),

      section('Svelte', {},
        h('p', {}, 'An action is the natural fit: it runs when the element is added, and returns an object to update and clean up.'),
        codeBlock(`
<script>
  import { createToggle } from 'vitrium';
  export let value = false;
  export let label;

  function glassToggle(node, params) {
    const toggle = createToggle({
      value: params.value, label: params.label,
      onChange: (on) => (value = on),   // writes back to the component's own value
    });
    node.append(toggle.el);
    return {
      update: (next) => toggle.set(next.value),
      destroy: () => toggle.destroy(),
    };
  }
</script>

<span use:glassToggle={{ value, label }} />`)),

      section('Keeping state in sync', {},
        h('p', {}, 'Data flows two ways, and the components are built so it does not loop:'),
        h('ul', { class: 'steps' },
          h('li', {}, h('strong', {}, 'Out: the callbacks. '), '`onChange`, `onSelect` and the like run when the user does something, and tell you the new value.'),
          h('li', {}, h('strong', {}, 'In: `set()`. '), 'It moves the component to a value and, by default, is silent: it does not call the callback, since your code made the change. The exceptions are called out on each page. The segmented control calls `onSelect` with `silent: true`, so ignore those calls.'),
          h('li', {}, h('strong', {}, 'Options fixed at creation. '), 'Some options cannot change on a live component, such as a slider\'s step. Rebuild it when they change, or key it by them.'))),

      section('What lives on the body', {},
        h('p', {}, 'Most components live where you put them. A few put their panel at the top level of the page instead, so that no ancestor can clip them or stack above them:'),
        table(['Component', 'What is on `<body>`'], [
          ['Popover', 'The popover panel.'],
          ['Menu, chip picker, list picker', 'The morph panel.'],
          ['Sheet', 'The sheet, its scrim and its shield, unless `container` says otherwise.'],
          ['Alert', 'The dialog and its scrim.'],
        ]),
        h('p', {}, 'Removing your element does not remove these, so always call `destroy()` when the component unmounts. Otherwise a hidden panel is left behind on every visit.')),

      section('Passing content', {},
        h('p', {}, 'Options like `content`, `header` and `icon` take a DOM node or a string of trusted HTML. From a framework, the simplest is to give them a node you own: create an element, render into it with your framework\'s own root or portal, and pass that element.'),
        codeBlock(`
const mount = document.createElement('div');
const root = createRoot(mount);
root.render(<Details />);

const popover = createPopover({ trigger, content: mount });
// later
popover.destroy();
root.unmount();`),
        h('p', {}, 'Do not build a string from user input: strings are inserted as HTML.')),
    ];
  },
};
