from __future__ import print_function

import argparse
import json
import os
import sys

try:
    from jupyter_client.kernelspec import KernelSpecManager
    from IPython.utils.tempdir import TemporaryDirectory
except:
    print('jupyter is not installed in this Python.', file=sys.stderr)
    sys.exit(1)


def create_kernel_jaon(is_js):
    bin = os.path.abspath(os.path.join(
        os.path.dirname(__file__), '..', 'bin', 'tslab'))
    argv = [bin, 'kernel', '--config-path={connection_file}']
    if is_js:
        argv.append('--js')
    return {
        "argv": argv,
        "display_name": "JavaScript" if is_js else "TypeScript",
        "language": "javascript" if is_js else "typescript",
    }


def install_kernel_spec(is_js, user, prefix):
    create_kernel_jaon(True)
    with TemporaryDirectory() as td:
        os.chmod(td, 0o755)  # Starts off as 700, not user readable
        with open(os.path.join(td, 'kernel.json'), 'w') as f:
            json.dump(create_kernel_jaon(is_js), f, sort_keys=True)
        # TODO: Copy any resources
        print('Installing {} kernel spec'.format(
            'JavaScript' if is_js else 'TypeScript'))
        KernelSpecManager().install_kernel_spec(
            td, 'jslab' if is_js else 'tslab',
            user=user,
            prefix=prefix)


def _is_root():
    try:
        return os.geteuid() == 0
    except AttributeError:
        return False  # assume not an admin on non-Unix platforms


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument(
        '--user',
        action='store_true',
        help="Install to the per-user kernels registry. Default if not root.")
    ap.add_argument(
        '--sys-prefix',
        action='store_true',
        help="Install to sys.prefix (e.g. a virtualenv or conda env)")
    ap.add_argument(
        '--prefix',
        help="Install to the given prefix. "
        "Kernelspec will be installed in {PREFIX}/share/jupyter/kernels/")
    args = ap.parse_args(argv)

    if args.sys_prefix:
        args.prefix = sys.prefix
    if not args.prefix and not _is_root():
        args.user = True

    for is_js in [False, True]:
        install_kernel_spec(is_js, args.user, args.prefix)


if __name__ == '__main__':
    main()