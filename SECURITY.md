# Security

techistack reads people's photo archives, so two things matter most: it must
never change or delete originals, and it must not be a way in through a
crafted image file.

If you find a way it can change, delete or overwrite a file outside its own
dated `contactsheet_…`, `_curate_…` and `selection_…` folders, or a security
problem in it or its dependencies (sharp, pdf-lib), please report it
privately through GitHub: **Security › Report a vulnerability** on this repo.
Please don't open a public issue for it.

Only the latest release is supported. It's beta; run it on a copy.
