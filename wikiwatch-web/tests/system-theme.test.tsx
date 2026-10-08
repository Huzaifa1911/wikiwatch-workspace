import {test} from 'node:test';
import assert from 'node:assert/strict';
import {followSystemTheme, setThemePreference, THEME_KEY} from '../src/systemTheme';

function fixture(matches: boolean) {
  const classes = new Set<string>();
  const listeners = new Set<() => void>();
  const media = {matches,
    addEventListener: (name: string, listener: () => void) => {assert.equal(name,'change');listeners.add(listener)},
    removeEventListener: (name: string, listener: () => void) => {assert.equal(name,'change');listeners.delete(listener)},
  };
  const browser = {matchMedia: (query: string) => {assert.equal(query,'(prefers-color-scheme: dark)');return media}} as unknown as Window;
  const root = {classList: {toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name)},style:{colorScheme:''}} as unknown as HTMLElement;
  return {browser,root,classes,listeners,change(value: boolean){media.matches=value;listeners.forEach(listener=>listener())}};
}

test('initial theme follows the system before the first render',()=>{
  for(const dark of [true,false]){
    const f=fixture(dark);const dispose=followSystemTheme(f.browser,f.root);
    assert.equal(f.classes.has('dark'),dark);
    assert.equal(f.root.style.colorScheme,dark?'dark':'light');dispose();
  }
});
test('system changes update the theme without a route change',()=>{
  const f=fixture(false);const dispose=followSystemTheme(f.browser,f.root);
  f.change(true);assert.equal(f.classes.has('dark'),true);assert.equal(f.root.style.colorScheme,'dark');
  f.change(false);assert.equal(f.classes.has('dark'),false);assert.equal(f.root.style.colorScheme,'light');dispose();
});
test('disposing removes the media listener',()=>{
  const f=fixture(true);const dispose=followSystemTheme(f.browser,f.root);
  assert.equal(f.listeners.size,1);dispose();assert.equal(f.listeners.size,0);
});

function withStorage(f: ReturnType<typeof fixture>, saved?: string) {
  const values = new Map<string,string>(saved ? [[THEME_KEY,saved]] : []);
  const events = new Set<(event: Event) => void>();
  Object.assign(f.browser, {
    localStorage: {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)},
    addEventListener: (_name:string,fn:(event:Event)=>void)=>events.add(fn),
    removeEventListener: (_name:string,fn:(event:Event)=>void)=>events.delete(fn),
  });
  return {values,events,change(value:string){values.set(THEME_KEY,value);events.forEach(fn=>fn({key:THEME_KEY} as StorageEvent))}};
}

test('manual choice persists and takes precedence over system changes',()=>{
  const f=fixture(true);const storage=withStorage(f);
  let dispose=followSystemTheme(f.browser,f.root);
  setThemePreference('light');assert.equal(storage.values.get(THEME_KEY),'light');
  f.change(false);f.change(true);assert.equal(f.classes.has('dark'),false);
  dispose();dispose=followSystemTheme(f.browser,f.root);
  assert.equal(f.root.style.colorScheme,'light');dispose();
});

test('reset restores live system following and removes the override',()=>{
  const f=fixture(false);const storage=withStorage(f,'dark');
  const dispose=followSystemTheme(f.browser,f.root);
  assert.equal(f.classes.has('dark'),true);
  setThemePreference('system');assert.equal(storage.values.has(THEME_KEY),false);
  assert.equal(f.classes.has('dark'),false);
  f.change(true);assert.equal(f.classes.has('dark'),true);dispose();
  assert.equal(storage.events.size,0);
});

test('theme choice synchronizes across tabs',()=>{
  const f=fixture(false);const storage=withStorage(f);
  const dispose=followSystemTheme(f.browser,f.root);
  storage.change('dark');assert.equal(f.classes.has('dark'),true);
  storage.change('unknown');assert.equal(f.classes.has('dark'),false);dispose();
});

test('storage restrictions do not prevent changing the theme',()=>{
  const f=fixture(false);
  Object.defineProperty(f.browser,'localStorage',{get(){throw Error('Storage blocked')}});
  const dispose=followSystemTheme(f.browser,f.root);
  setThemePreference('dark');assert.equal(f.classes.has('dark'),true);
  setThemePreference('light');assert.equal(f.classes.has('dark'),false);dispose();
});
