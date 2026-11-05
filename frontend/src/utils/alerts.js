import Swal from 'sweetalert2';

const commonOptions = {
  confirmButtonColor: '#2563eb',
  cancelButtonColor: '#64748b',
  heightAuto: false,
  allowOutsideClick: false,
};

export const showSuccess = (title, text = '') =>
  Swal.fire({
    ...commonOptions,
    icon: 'success',
    title,
    text,
    confirmButtonText: 'OK',
  });

export const showError = (title, text = '') =>
  Swal.fire({
    ...commonOptions,
    icon: 'error',
    title,
    text,
    confirmButtonText: 'OK',
  });

export const showWarning = (title, text = '') =>
  Swal.fire({
    ...commonOptions,
    icon: 'warning',
    title,
    text,
    confirmButtonText: 'OK',
  });

export const showInfo = (title, text = '') =>
  Swal.fire({
    ...commonOptions,
    icon: 'info',
    title,
    text,
    confirmButtonText: 'OK',
  });

export const showConfirm = async (
  title,
  text = 'Are you sure you want to continue?',
  confirmButtonText = 'Yes, continue'
) => {
  const result = await Swal.fire({
    ...commonOptions,
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancel',
    reverseButtons: true,
  });

  return result.isConfirmed;
};
