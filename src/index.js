/**
 * Package entry point. The Host half owns only the Markdown read route; the
 * browser half is discovered from this same manifest's `dsh.client` field and
 * ships prebuilt as `./lib/client.js`, so installing this package never needs a
 * build step.
 */

export { apply, inject, name } from './plugin.js';
