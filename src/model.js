/* model.js
 *
 * Copyright 2020 Martin Abente Lahaye
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const {GObject, GLib, Gio} = imports.gi;

const _propFlags = GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT;

const _groupDescriptions = {
    shared: _('List of subsystems shared with the host system'),
    sockets: _('List of well-known sockets available in the sandbox'),
    devices: _('List of devices available in the sandbox'),
    features: _('List of features available to the application'),
    filesystems: _('List of filesystem subsets available to the application'),
};

var GROUP = 'Context';
var DELAY = 500;


var FlatsealModel = GObject.registerClass({
    GTypeName: 'FlatsealModel',
    Properties: {
        'shared-network': GObject.ParamSpec.boolean(
            'shared-network',
            '0.4.0',
            _('Network'),
            _propFlags, false),
        'shared-ipc': GObject.ParamSpec.boolean(
            'shared-ipc',
            '0.4.0',
            _('Inter-process communications'),
            _propFlags, false),
        'sockets-x11': GObject.ParamSpec.boolean(
            'sockets-x11',
            '0.4.0',
            _('X11 windowing system'),
            _propFlags, false),
        'sockets-wayland': GObject.ParamSpec.boolean(
            'sockets-wayland',
            '0.4.0',
            _('Wayland windowing system'),
            _propFlags, false),
        'sockets-fallback-x11': GObject.ParamSpec.boolean(
            'sockets-fallback-x11',
            '0.11.1',
            _('Fallback to X11 windowing system'),
            _propFlags, false),
        'sockets-pulseaudio': GObject.ParamSpec.boolean(
            'sockets-pulseaudio',
            '0.4.0',
            _('PulseAudio sound server'),
            _propFlags, false),
        'sockets-session-bus': GObject.ParamSpec.boolean(
            'sockets-session-bus',
            '0.4.0',
            _('D-Bus session bus'),
            _propFlags, false),
        'sockets-system-bus': GObject.ParamSpec.boolean(
            'sockets-system-bus',
            '0.4.0',
            _('D-Bus system bus'),
            _propFlags, false),
        'sockets-ssh-auth': GObject.ParamSpec.boolean(
            'sockets-ssh-auth',
            '0.99.1',
            _('Secure Shell agent'),
            _propFlags, false),
        'sockets-pcsc': GObject.ParamSpec.boolean(
            'sockets-pcsc',
            '1.3.2',
            _('Smart cards'),
            _propFlags, false),
        'sockets-cups': GObject.ParamSpec.boolean(
            'sockets-cups',
            '1.5.2',
            _('Printing system'),
            _propFlags, false),
        'devices-dri': GObject.ParamSpec.boolean(
            'devices-dri',
            '0.4.0',
            _('GPU acceleration'),
            _propFlags, false),
        'devices-kvm': GObject.ParamSpec.boolean(
            'devices-kvm',
            '0.6.12',
            _('Virtualization'),
            _propFlags, false),
        'devices-shm': GObject.ParamSpec.boolean(
            'devices-shm',
            '1.6.1',
            _('Shared memory (e.g. JACK sound server)'),
            _propFlags, false),
        'devices-all': GObject.ParamSpec.boolean(
            'devices-all',
            '0.6.6',
            _('All devices (e.g. webcam)'),
            _propFlags, false),
        'features-devel': GObject.ParamSpec.boolean(
            'features-devel',
            '0.6.10',
            _('Development syscalls (e.g. ptrace)'),
            _propFlags, false),
        'features-multiarch': GObject.ParamSpec.boolean(
            'features-multiarch',
            '0.6.12',
            _('Programs from other architectures'),
            _propFlags, false),
        'features-bluetooth': GObject.ParamSpec.boolean(
            'features-bluetooth',
            '0.11.8',
            _('Bluetooth'),
            _propFlags, false),
        'features-canbus': GObject.ParamSpec.boolean(
            'features-canbus',
            '1.0.3',
            _('Controller Area Network bus'),
            _propFlags, false),
        'filesystems-host': GObject.ParamSpec.boolean(
            'filesystems-host',
            '0.4.0',
            _('All system files'),
            _propFlags, false),
        'filesystems-host-os': GObject.ParamSpec.boolean(
            'filesystems-host-os',
            '1.7.1',
            _('All system libraries, executables and static data'),
            _propFlags, false),
        'filesystems-host-etc': GObject.ParamSpec.boolean(
            'filesystems-host-etc',
            '1.7.1',
            _('All system configurations'),
            _propFlags, false),
        'filesystems-home': GObject.ParamSpec.boolean(
            'filesystems-home',
            '0.4.0',
            _('All user files'),
            _propFlags, false),
        'filesystems-other': GObject.ParamSpec.string(
            'filesystems-other',
            '0.6.14',
            _('Other files'),
            _propFlags, ''),
    },
    Signals: {
        changed: {
            param_types: [GObject.TYPE_BOOLEAN],
        },
    },
}, class FlatsealModel extends GObject.Object {
    _init() {
        super._init({});
        this._appId = '';
        this._delayedHandlerId = 0;
        this._flatpakVersion = null;
        this._installationsPaths = null;

        this._systemInstallationPath = GLib.build_filenamev([
            GLib.DIR_SEPARATOR_S, 'var', 'lib', 'flatpak',
        ]);
        this._userInstallationPath = GLib.build_filenamev([
            GLib.get_home_dir(), '.local', 'share', 'flatpak',
        ]);
        this._flatpakInfoPath = GLib.build_filenamev([
            GLib.DIR_SEPARATOR_S, '.flatpak-info',
        ]);
        this._flatpakConfigPath = GLib.build_filenamev([
            GLib.DIR_SEPARATOR_S, 'run', 'host', 'etc', 'flatpak', 'installations.d',
        ]);

        this._notifyHandlerId = this.connect('notify', this._delayedUpdate.bind(this));
    }

    _isSupported(appVersion) {
        if (this._flatpakVersion === null) {
            try {
                this._flatpakVersion = this._getFlatpakVersion();
            } catch (err) {
                return true;
            }
        }

        const flatpakVersions = this._flatpakVersion.split('.');
        const appVersions = appVersion.split('.');
        const components = Math.max(flatpakVersions.length, appVersions.length);

        for (var index = 0; index < components; index++) {
            const _flatpakVersion = parseInt(flatpakVersions[index] || 0, 10);
            const _appVersion = parseInt(appVersions[index] || 0, 10);

            if (_flatpakVersion < _appVersion)
                return false;
            if (_flatpakVersion > _appVersion)
                return true;
        }

        return true;
    }

    _getFlatpakVersion() {
        const keyFile = new GLib.KeyFile();
        keyFile.load_from_file(this._flatpakInfoPath, 0);
        return keyFile.get_value('Instance', 'flatpak-version');
    }

    static _getCustomInsllations(path) {
        const installations = [];
        const keyFile = new GLib.KeyFile();

        keyFile.load_from_file(path, 0);

        const [groups] = keyFile.get_groups();
        groups.forEach(group => {
            const installation = {};
            installation['path'] = keyFile.get_value(group, 'Path');

            try {
                installation['priority'] = keyFile.get_value(group, 'Priority');
            } catch (err) {
                installation['priority'] = 0;
            }

            installations.push(installation);
        });

        return installations;
    }

    _getCustomInstallationsPaths() {
        var custom = [];

        if (GLib.access(this._flatpakConfigPath, 0) !== 0)
            return custom;

        const directory = Gio.File.new_for_path(this._flatpakConfigPath);
        const enumerator = directory.enumerate_children('*', Gio.FileQueryInfoFlags.NONE, null);
        var info = enumerator.next_file(null);

        while (info !== null) {
            const file = enumerator.get_child(info);
            custom = [...custom, ...this.constructor._getCustomInsllations(file.get_path())];
            info = enumerator.next_file(null);
        }

        return custom
            .sort((a, b) => b.priority - a.priority)
            .map(e => e.path);
    }

    _getInstallationsPaths() {
        if (this._installationsPaths !== null)
            return this._installationsPaths;

        /* Installation priority is handled by this list order */
        this._installationsPaths = this._getCustomInstallationsPaths();
        this._installationsPaths.unshift(this._userInstallationPath);
        this._installationsPaths.push(this._systemInstallationPath);

        return this._installationsPaths;
    }

    _getUserInstallationPath() {
        return this._userInstallationPath;
    }

    _getOverridesPath() {
        return GLib.build_filenamev([
            this._getUserInstallationPath(), 'overrides', this._appId,
        ]);
    }

    _getBundlePathForAppId(appId) {
        return this._getInstallationsPaths()
            .map(p => GLib.build_filenamev([p, 'app', appId, 'current', 'active']))
            .find(p => GLib.access(p, 0) === 0);
    }

    _getMetadataPath() {
        return GLib.build_filenamev([this._getBundlePathForAppId(this._appId), 'metadata']);
    }

    static _getPermissionsForPath(path) {
        const list = [];

        if (GLib.access(path, 0) !== 0)
            return list;

        const keyFile = new GLib.KeyFile();
        keyFile.load_from_file(path, 0);

        if (!keyFile.has_group(GROUP))
            return list;

        const [keys] = keyFile.get_keys(GROUP);

        keys.forEach(key => {
            const values = keyFile.get_value(GROUP, key).split(';');
            values.forEach(value => {
                if (value.length === 0)
                    return;

                list.push(`${key}=${value}`);
            });
        });

        return list;
    }

    _getPermissions() {
        return this.constructor._getPermissionsForPath(this._getMetadataPath());
    }

    _getOverrides() {
        return this.constructor._getPermissionsForPath(this._getOverridesPath());
    }

    _checkIfChanged() {
        const exists = GLib.access(this._getOverridesPath(), 0) === 0;
        this.emit('changed', exists);
    }

    static _realIsOverridenPath(overrides, permission) {
        if (!permission.startsWith('filesystems='))
            return false;

        const [_permission] = permission.split(':');

        if (overrides.has(_permission))
            return true;
        else if (overrides.has(`${_permission}:ro`))
            return true;
        else if (overrides.has(`${_permission}:rw`))
            return true;
        else if (overrides.has(`${_permission}:create`))
            return true;

        return false;
    }

    static _isOverridenPath(overrides, permission) {
        return this._realIsOverridenPath(overrides, permission) ||
               this._realIsOverridenPath(overrides, this._negatePermission(permission));
    }

    static _isNegatedPermission(permission) {
        return permission.indexOf('=!') !== -1;
    }

    static _negatePermission(permission) {
        if (this._isNegatedPermission(permission))
            return permission.replace('=!', '=');
        return permission.replace('=', '=!');
    }

    _getCurrentPermissions() {
        const permissions = this._getPermissions();
        const overrides = new Set(this._getOverrides());

        /* Remove permission if overriden already */
        const current = new Set(permissions
            .filter(p => !overrides.has(this.constructor._negatePermission(p)))
            .filter(p => !this.constructor._isOverridenPath(overrides, p)));

        /* Add permission if a) not a negation b) doesn't exists */
        [...overrides]
            .filter(p => !this.constructor._isNegatedPermission(p))
            .forEach(p => current.add(p));

        return [...current];
    }

    _setOverrides(overrides) {
        const keyFile = new GLib.KeyFile();

        overrides.forEach(override => {
            var [key, value] = override.split('=');

            try {
                var _value = keyFile.get_value(GROUP, key);
                value = `${_value};${value}`;
            } catch (err) {
                value = `${value}`;
            }
            keyFile.set_value(GROUP, key, value);
        });

        const [, length] = keyFile.to_data();
        const path = this._getOverridesPath();

        if (length === 0)
            GLib.unlink(path);
        else
            keyFile.save_to_file(path);

        this._checkIfChanged();
    }

    _updateProperties() {
        GObject.signal_handler_block(this, this._notifyHandlerId);

        const permissions = this._getCurrentPermissions();
        const props = GObject.Object.list_properties.call(this.constructor.$gtype);

        props.forEach(pspec => {
            var value;
            const property = pspec.get_name();
            const permission = property.replace(/-/, '=');
            const [key] = permission.split('=');
            const isText = typeof pspec.get_default_value() === 'string';

            if (isText) {
                value = permissions
                    .filter(p => p.startsWith(`${key}=`))
                    .map(p => p.split('=')[1])
                    .filter(p => ['home', 'host', 'host-os', 'host-etc'].indexOf(p) === -1)
                    .join(';');
            } else {
                value = permissions.indexOf(permission) !== -1;
            }

            this[property.replace(/-/g, '_')] = value;
            this.notify(property);
        });

        this._checkIfChanged();

        GObject.signal_handler_unblock(this, this._notifyHandlerId);
    }

    _delayedUpdate() {
        if (this._delayedHandlerId !== 0)
            GLib.Source.remove(this._delayedHandlerId);

        this._delayedHandlerId = GLib.timeout_add(
            GLib.PRIORITY_HIGH, DELAY, this._findChangesAndUpdate.bind(this));
    }

    _processPendingUpdates() {
        if (this._delayedHandlerId === 0)
            return;

        GLib.Source.remove(this._delayedHandlerId);
        this._findChangesAndUpdate();
    }

    _findChangesAndUpdate() {
        const selected = new Set();
        const existing = new Set(this._getPermissions());
        const props = GObject.Object.list_properties.call(this.constructor.$gtype);

        props.forEach(pspec => {
            const property = pspec.get_name();
            const attribute = property.replace(/-/g, '_');
            const permission = property.replace(/-/, '=');

            if (typeof pspec.get_default_value() === 'boolean' && this[attribute]) {
                selected.add(permission);
            } else if (typeof pspec.get_default_value() === 'string') {
                const [real_permission] = permission.split('=');
                var values = this[attribute].split(';');

                values.forEach(value => {
                    if (value.length === 0)
                        return;

                    selected.add(`${real_permission}=${value}`);
                });
            }
        });

        /* Add overrides that didn't exist in the original permissions */
        const added = new Set([...selected].filter(p => !existing.has(p)));

        /* Don't mess with permissions we don't support */
        const supportedState = new Set(this.listPermissions()
            .filter(p => p.type !== 'text')
            .map(p => p.permission));
        const supportedText = new Set(this.listPermissions()
            .filter(p => p.type === 'text')
            .map(p => p.permission.split('=')[0]));

        /* Add overrides that explicitly negate original permissions */
        const removed = new Set([...existing]
            .filter(p => supportedState.has(p) || supportedText.has(p.split('=')[0]))
            .filter(p => !selected.has(p))
            .filter(p => !this.constructor._isOverridenPath(added, p))
            .map(p => this.constructor._negatePermission(p)));

        this._setOverrides([...added, ...removed]);
        this._delayedHandlerId = 0;
        return GLib.SOURCE_REMOVE;
    }

    _getIconThemePathForAppId(appId) {
        return GLib.build_filenamev([
            this._getBundlePathForAppId(appId), 'files', 'share', 'icons',
        ]);
    }

    static _getApproximateNameForAppId(appId) {
        const name = appId.split('.').pop();
        return name.replace(/^\w/, c => c.toUpperCase());
    }

    _getNameForAppId(appId) {
        const key = 'Name';
        const group = 'Desktop Entry';
        const path = GLib.build_filenamev([
            this._getBundlePathForAppId(appId),
            'files', 'share', 'applications', `${appId}.desktop`,
        ]);

        if (GLib.access(path, 0) !== 0)
            return this.constructor._getApproximateNameForAppId(appId);

        const keyFile = new GLib.KeyFile();
        keyFile.load_from_file(path, 0);

        if (!keyFile.has_group(group))
            return this.constructor._getApproximateNameForAppId(appId);

        return keyFile.get_value(group, key);
    }

    /* XXX this only covers cases that follow the flathub convention */
    static _isBaseApp(appId) {
        return appId.endsWith('.BaseApp');
    }

    _listApplicationsForPath(path) {
        const list = [];

        if (GLib.access(path, 0) !== 0)
            return list;

        const directory = Gio.File.new_for_path(path);
        const enumerator = directory.enumerate_children('*', Gio.FileQueryInfoFlags.NONE, null);
        var info = enumerator.next_file(null);

        while (info !== null) {
            const file = enumerator.get_child(info);
            const appId = GLib.path_get_basename(file.get_path());
            const activePath = GLib.build_filenamev([file.get_path(), 'current', 'active']);

            if (!this.constructor._isBaseApp(appId) && GLib.access(activePath, 0) === 0)
                list.push(appId);

            info = enumerator.next_file(null);
        }
        return list;
    }

    listApplications() {
        const installations = this._getInstallationsPaths();
        var applications = [];

        installations.forEach(path => {
            const app = GLib.build_filenamev([path, 'app']);
            applications = [...applications, ...this._listApplicationsForPath(app)];
        });

        const union = new Set(applications);
        const list = [...union];

        list.sort();

        return list.map(appId => {
            return {
                appId: appId,
                appThemePath: this._getIconThemePathForAppId(appId),
                appName: this._getNameForAppId(appId),
            };
        });
    }

    listPermissions() {
        const list = [];
        const props = GObject.Object.list_properties.call(this.constructor.$gtype);

        props.forEach(pspec => {
            const property = pspec.get_name();
            const entry = {};
            const isText = typeof pspec.get_default_value() === 'string';
            const appVersion = pspec.get_nick();
            const [group] = property.split('-');

            entry['property'] = property;
            entry['description'] = pspec.get_blurb();
            entry['value'] = this[pspec.get_name().replace(/-/g, '_')];
            entry['type'] = isText ? 'text' : 'state';
            entry['permission'] = property.replace(/-/, '=');
            entry['supported'] = this._isSupported(appVersion);
            entry['group'] = group;
            entry['groupDescription'] = _groupDescriptions[group];

            list.push(entry);
        });

        return list;
    }

    setAppId(appId) {
        this._processPendingUpdates();
        this._appId = appId;
        this._updateProperties();
    }

    resetPermissions() {
        const path = this._getOverridesPath();
        GLib.unlink(path);
        this._updateProperties();
    }

    shutdown() {
        this._processPendingUpdates();
    }

    setSystemInstallationPath(path) {
        this._systemInstallationPath = path;
    }

    setUserInstallationPath(path) {
        this._userInstallationPath = path;
    }

    setFlatpakInfoPath(path) {
        this._flatpakInfoPath = path;
    }

    setFlatpakConfigPath(path) {
        this._flatpakConfigPath = path;
    }
});
