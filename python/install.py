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


def create_kernel_jaon(is_ts):
    bin = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '../bin',
                     'tslab' if is_ts else 'jslab'))
    return {
        "argv": [bin, "kernel", "--config-path={connection_file}"],
        "display_name": "TypeScript" if is_ts else "JavaScript",
        "language": "typescript" if is_ts else "javascript",
    }


def install_kernel_spec(is_ts, user, prefix):
    create_kernel_jaon(True)
    with TemporaryDirectory() as td:
        os.chmod(td, 0o755)  # Starts off as 700, not user readable
        with open(os.path.join(td, 'kernel.json'), 'w') as f:
            json.dump(create_kernel_jaon(is_ts), f, sort_keys=True)
        # TODO: Copy any resources

        print('Installing {} kernel spec'.format(
            'TypeScript' if is_ts else 'JavaScript'))
        KernelSpecManager().install_kernel_spec(td,
                                                'tslab' if is_ts else 'jslab',
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

    for is_ts in [True]:
        install_kernel_spec(is_ts, args.user, args.prefix)


if __name__ == '__main__':
    main()